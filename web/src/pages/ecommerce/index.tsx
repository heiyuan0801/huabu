import { App, Button, Image, Input, InputNumber, Modal, Segmented, Select, Switch, Tooltip } from "antd";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Combine, Download, FileArchive, HardDriveDownload, ImagePlus, LoaderCircle, Pencil, RefreshCw, Sparkles, Square, Trash2, Type, Upload, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { ImageGenerationPlaceholder } from "@/components/image-generation-placeholder";
import { mapWithConcurrency, parseDetailPlan, sliceVerticalImage, stitchVerticalImages, type DetailPlanSection } from "@/lib/ecommerce-detail";
import {
    buildCampaignStyleLock,
    buildCrossBorderMarketBrief,
    buildEcommerceSectionPrompt,
    ECOMMERCE_CHANNELS,
    ECOMMERCE_CONVERSION_DRIVERS,
    ECOMMERCE_COPY_LOCALES,
    ECOMMERCE_MARKETS,
    ECOMMERCE_PACKAGE_TYPES,
    ECOMMERCE_SCENE_TEMPLATES,
    ECOMMERCE_VISUAL_PRESETS,
    getConversionHint,
    getDefaultTemplateForRole,
    getEcommerceSceneTemplate,
    getPackageSequenceHint,
    getSceneRoleLibrary,
    getSceneTemplateCatalog,
    getSceneTemplateLabel,
    matchEcommerceSceneTemplate,
    type EcommerceChannel,
    type EcommerceConversionDriver,
    type EcommerceCopyLocale,
    type EcommerceMarket,
    type EcommerceMarketMode,
    type EcommercePackageType,
    type EcommerceSceneRole,
    type EcommerceSceneTemplateId,
    type EcommerceTemplateMode,
    type EcommerceVisualPreset,
} from "@/lib/ecommerce-templates";
import { convertImageDataUrl, formatDuration, getDataUrlByteSize, readFileAsDataUrl } from "@/lib/image-utils";
import { createZip } from "@/lib/zip";
import { isRetryableImageError, requestEdit, requestImageQuestion } from "@/services/api/image";
import { saveImageGenerationLog } from "@/services/image-generation-log";
import { deleteStoredImages, imageToDataUrl, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelOptionLabel, proxyWeilaiUrl, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { useEcommerceProjectPersistence, type CommerceImage, type CommerceSection } from "./use-ecommerce-project";

const TRANSIENT_RETRY_DELAYS = [1500, 3000];
const EXPORT_PRESETS: Record<string, number> = { taobao: 750, jd: 790, pdd: 750, douyin: 750, hd: 1080 };
const FALLBACK_STAGE_KEYS = ["hero", "benefit", "benefitExtra", "material", "detail", "scene", "trust", "closing"] as const;
const FALLBACK_STAGE_ROLES: EcommerceSceneRole[] = ["hero", "feature", "feature", "macro", "macro", "scene", "trust", "trust"];
const TEMPLATE_GROUPS = ["product", "marketing", "information", "people", "technical", "campaign"] as const;
const FALLBACK_STAGE_INDEXES: Record<number, number[]> = {
    3: [0, 1, 7],
    4: [0, 1, 5, 7],
    5: [0, 1, 4, 5, 7],
    6: [0, 1, 3, 4, 5, 7],
    7: [0, 1, 2, 3, 4, 5, 7],
    8: [0, 1, 2, 3, 4, 5, 6, 7],
};

function createPendingImage(url: string, ratio: string): CommerceImage {
    const [ratioWidth = 3, ratioHeight = 4] = ratio.split(":").map(Number);
    const width = 768;
    const dataMimeType = url.match(/^data:([^;,]+)/i)?.[1];
    const extension = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase();
    const mimeType = dataMimeType || (extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "image/png");
    return { url, width, height: Math.round((width * ratioHeight) / ratioWidth), bytes: getDataUrlByteSize(url), mimeType, localizationStatus: "pending" };
}

async function retryTransientRequest<T>(request: () => Promise<T>, signal: AbortSignal) {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await request();
        } catch (error) {
            if (signal.aborted || attempt >= TRANSIENT_RETRY_DELAYS.length || !isRetryableImageError(error)) throw error;
            await waitForRetry(TRANSIENT_RETRY_DELAYS[attempt], signal);
        }
    }
}

function waitForRetry(ms: number, signal: AbortSignal) {
    if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    return new Promise<void>((resolve, reject) => {
        let timer = 0;
        const onAbort = () => {
            window.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        };
        timer = window.setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

export default function EcommercePage() {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const runIdRef = useRef(0);
    const composeIdRef = useRef(0);
    const sectionsRef = useRef<CommerceSection[]>([]);
    const longImageRef = useRef<CommerceImage | null>(null);
    const localizationTasksRef = useRef(new Map<string, Promise<CommerceImage | null>>());
    const localizationQueueRef = useRef<Promise<void>>(Promise.resolve());
    const localizationQueueIdRef = useRef(0);
    const busyRef = useRef(false);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const [reference, setReference] = useState<ReferenceImage | null>(null);
    const [productInfo, setProductInfo] = useState("");
    const [packageType, setPackageType] = useState<EcommercePackageType>("detail");
    const [conversionDriver, setConversionDriver] = useState<EcommerceConversionDriver>("visual");
    const [visualPreset, setVisualPreset] = useState<EcommerceVisualPreset>("clean");
    const [templateMode, setTemplateMode] = useState<EcommerceTemplateMode>("auto");
    const [sceneTemplateId, setSceneTemplateId] = useState<EcommerceSceneTemplateId>("hero-image");
    const [sceneVariantId, setSceneVariantId] = useState("");
    const [antiAiEnabled, setAntiAiEnabled] = useState(true);
    const [marketMode, setMarketMode] = useState<EcommerceMarketMode>("domestic");
    const [targetChannel, setTargetChannel] = useState<EcommerceChannel>("amazon");
    const [targetMarket, setTargetMarket] = useState<EcommerceMarket>("us");
    const [copyLocale, setCopyLocale] = useState<EcommerceCopyLocale>("en-US");
    const [audienceProfile, setAudienceProfile] = useState("");
    const [offerDetails, setOfferDetails] = useState("");
    const [complianceEnabled, setComplianceEnabled] = useState(true);
    const [styleLock, setStyleLock] = useState("");
    const [proofPoints, setProofPoints] = useState("");
    const [sectionCount, setSectionCount] = useState(5);
    const [ratio, setRatio] = useState("3:4");
    const [sections, setSections] = useState<CommerceSection[]>([]);
    const [longImage, setLongImage] = useState<CommerceImage | null>(null);
    const [running, setRunning] = useState(false);
    const [composing, setComposing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [phase, setPhase] = useState<"idle" | "planning" | "generating" | "editing" | "composing" | "exporting">("idle");
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [overlayEnabled, setOverlayEnabled] = useState(false);
    const [exportPreset, setExportPreset] = useState("taobao");
    const [sliceHeight, setSliceHeight] = useState(2000);
    const [editTargetId, setEditTargetId] = useState<string | null>(null);
    const [editPrompt, setEditPrompt] = useState("");
    const [copyTargetId, setCopyTargetId] = useState<string | null>(null);
    const [copyTitle, setCopyTitle] = useState("");
    const [copyBody, setCopyBody] = useState("");
    const imageModel = effectiveConfig.imageModel || effectiveConfig.model;
    const textModel = effectiveConfig.textModel || effectiveConfig.model;
    const productTitle = productInfo.trim().split(/\n|，|。/)[0]?.slice(0, 24) || t("ecommerce.untitledProduct");
    const campaignStyleLock = useMemo(() => buildCampaignStyleLock(visualPreset, ratio, styleLock), [ratio, styleLock, visualPreset]);
    const marketBrief = useMemo(
        () => marketMode === "cross-border" ? buildCrossBorderMarketBrief({ channel: targetChannel, market: targetMarket, copyLocale, audienceProfile, offerDetails, complianceEnabled }) : "",
        [audienceProfile, complianceEnabled, copyLocale, marketMode, offerDetails, targetChannel, targetMarket],
    );
    const selectedSceneTemplate = getEcommerceSceneTemplate(sceneTemplateId);
    const sceneTemplateOptions = TEMPLATE_GROUPS.map((group) => ({
        label: t(`ecommerce.templateGroups.${group}`),
        options: ECOMMERCE_SCENE_TEMPLATES.filter((template) => template.group === group).map((template) => ({ value: template.id, label: `${String(ECOMMERCE_SCENE_TEMPLATES.indexOf(template) + 1).padStart(2, "0")} ${template.name}` })),
    }));
    const projectSnapshot = useMemo(
        () => ({ reference, productInfo, packageType, conversionDriver, visualPreset, templateMode, sceneTemplateId, sceneVariantId, antiAiEnabled, marketMode, targetChannel, targetMarket, copyLocale, audienceProfile, offerDetails, complianceEnabled, styleLock, proofPoints, sectionCount, ratio, sections, longImage, overlayEnabled, exportPreset, sliceHeight }),
        [antiAiEnabled, audienceProfile, complianceEnabled, conversionDriver, copyLocale, exportPreset, longImage, marketMode, offerDetails, overlayEnabled, packageType, productInfo, proofPoints, ratio, reference, sceneTemplateId, sceneVariantId, sectionCount, sections, sliceHeight, styleLock, targetChannel, targetMarket, templateMode, visualPreset],
    );

    const projectHydrated = useEcommerceProjectPersistence(projectSnapshot, (project) => {
        setReference(project.reference);
        setProductInfo(project.productInfo);
        setPackageType(project.packageType || "detail");
        setConversionDriver(project.conversionDriver || "visual");
        setVisualPreset(project.visualPreset || "clean");
        setTemplateMode(project.templateMode || "auto");
        setSceneTemplateId(project.sceneTemplateId || "hero-image");
        setSceneVariantId(project.sceneVariantId || "");
        setAntiAiEnabled(project.antiAiEnabled ?? true);
        setMarketMode(project.marketMode || "domestic");
        setTargetChannel(project.targetChannel || "amazon");
        setTargetMarket(project.targetMarket || "us");
        setCopyLocale(project.copyLocale || "en-US");
        setAudienceProfile(project.audienceProfile || "");
        setOfferDetails(project.offerDetails || "");
        setComplianceEnabled(project.complianceEnabled ?? true);
        setStyleLock(project.styleLock || "");
        setProofPoints(project.proofPoints || "");
        setSectionCount(project.sectionCount);
        setRatio(project.ratio);
        sectionsRef.current = project.sections;
        setSections(project.sections);
        setLongImage(project.longImage);
        longImageRef.current = project.longImage;
        setOverlayEnabled(project.overlayEnabled);
        setExportPreset(project.exportPreset);
        setSliceHeight(project.sliceHeight);
    });

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        busyRef.current = running || composing || exporting;
    }, [composing, exporting, running]);

    useEffect(
        () => () => {
            runIdRef.current += 1;
            composeIdRef.current += 1;
            abortRef.current?.abort();
        },
        [],
    );

    const replaceSections = (value: CommerceSection[]) => {
        sectionsRef.current = value;
        setSections(value);
        return value;
    };

    const updateSections = (update: (value: CommerceSection[]) => CommerceSection[]) => replaceSections(update(sectionsRef.current));

    const replaceLongImage = (value: CommerceImage | null) => {
        longImageRef.current = value;
        setLongImage(value);
    };

    const invalidateWork = () => {
        runIdRef.current += 1;
        composeIdRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        setRunning(false);
        setComposing(false);
        setExporting(false);
        setPhase("idle");
    };

    const stopGeneration = () => {
        const interrupted = sectionsRef.current.map((section) =>
            section.status === "pending"
                ? section.image
                    ? { ...section, status: "success" as const, sourceImage: undefined, error: undefined }
                    : { ...section, status: "canceled" as const, error: t("imageChat.interrupted") }
                : section,
        );
        replaceSections(interrupted);
        invalidateWork();
        message.info(t("imageChat.interrupted"));
    };

    const selectReference = async (file?: File) => {
        if (!file || !file.type.startsWith("image/")) return;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            invalidateWork();
            setReference({ id: nanoid(), name: file.name, type: file.type, dataUrl });
            replaceSections([]);
            replaceLongImage(null);
        } catch {
            message.error(t("ecommerce.referenceReadFailed"));
        }
    };

    const ensureReady = (needsPlanningModel = true) => {
        if (!reference) {
            message.warning(t("ecommerce.referenceRequired"));
            return false;
        }
        if (!productInfo.trim()) {
            message.warning(t("ecommerce.productInfoRequired"));
            return false;
        }
        if (!isAiConfigReady(effectiveConfig, imageModel)) {
            message.warning(t("imageChat.configRequired"));
            openConfigDialog(true);
            return false;
        }
        if (needsPlanningModel && !isAiConfigReady(effectiveConfig, textModel)) {
            message.warning(t("imageChat.textConfigRequired"));
            openConfigDialog(true);
            return false;
        }
        return true;
    };

    const createFallbackPlan = () =>
        (FALLBACK_STAGE_INDEXES[sectionCount] || FALLBACK_STAGE_INDEXES[5]).map((stageIndex) => {
            const title = t(`ecommerce.fallbackStages.${FALLBACK_STAGE_KEYS[stageIndex]}`);
            const role = FALLBACK_STAGE_ROLES[stageIndex];
            const templateId = templateMode === "manual" ? sceneTemplateId : matchEcommerceSceneTemplate(productInfo, role) || getDefaultTemplateForRole(role);
            return {
                title,
                role,
                templateId,
                variantId: templateMode === "manual" ? sceneVariantId : "",
                headline: title,
                body: "",
                prompt: t("ecommerce.fallbackPrompt", { focus: title, packageType: t(`ecommerce.packageTypes.${packageType}`), conversionDriver: t(`ecommerce.conversionDrivers.${conversionDriver}`) }),
            };
        });

    const generatedAsset = (image: CommerceImage, title: string, metadata: Record<string, unknown>) => ({
        kind: "image" as const,
        title,
        coverUrl: image.url,
        tags: [t("ecommerce.assetTag")],
        source: t("ecommerce.title"),
        data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType },
        metadata: { source: "ecommerce", ...metadata },
    });

    const addGeneratedAsset = (image: CommerceImage, title: string, metadata: Record<string, unknown>) => addAsset(generatedAsset(image, title, metadata));

    const localizeGeneratedImage = (sectionId: string, image: CommerceImage, title: string, metadata: Record<string, unknown>) => {
        const assetId = image.assetId || addGeneratedAsset(image, title, metadata);
        const queueId = localizationQueueIdRef.current;
        const pendingImage: CommerceImage = { ...image, assetId, localizationStatus: "pending" };
        updateSections((value) =>
            value.map((section) =>
                section.id === sectionId
                    ? {
                          ...section,
                          image: section.image === image || section.image?.assetId === assetId ? pendingImage : section.image,
                          versions: section.versions.map((version) => (version === image || version.assetId === assetId ? pendingImage : version)),
                      }
                    : section,
            ),
        );
        const task = localizationQueueRef.current
            .then(() => {
                if (queueId !== localizationQueueIdRef.current) throw new DOMException("Superseded", "AbortError");
                return uploadImage(proxyWeilaiUrl(pendingImage.url));
            })
            .then((stored) => {
                const localized: CommerceImage = { ...stored, assetId, localizationStatus: "success" };
                updateSections((value) =>
                    value.map((section) =>
                        section.id === sectionId
                            ? {
                                  ...section,
                                  image: section.image?.assetId === assetId ? localized : section.image,
                                  sourceImage: section.sourceImage?.assetId === assetId ? localized : section.sourceImage,
                                  versions: section.versions.map((version) => (version.assetId === assetId ? localized : version)),
                              }
                            : section,
                    ),
                );
                updateAsset(assetId, generatedAsset(localized, title, metadata));
                return localized;
            })
            .catch(() => {
                updateSections((value) =>
                    value.map((section) =>
                        section.id === sectionId
                            ? {
                                  ...section,
                                  image: section.image?.assetId === assetId ? { ...section.image, localizationStatus: "error" } : section.image,
                                  versions: section.versions.map((version) => (version.assetId === assetId ? { ...version, localizationStatus: "error" } : version)),
                              }
                            : section,
                    ),
                );
                return null;
            });
        localizationQueueRef.current = task.then(() => undefined);
        localizationTasksRef.current.set(assetId, task);
        return { image: pendingImage, task };
    };

    const generateSection = async (section: CommerceSection, index: number, controller: AbortController, runId: number) => {
        const sectionStartedAt = performance.now();
        try {
            const generationReference: ReferenceImage = section.sourceImage
                ? { id: section.id, name: `${section.title}.png`, type: section.sourceImage.mimeType, dataUrl: proxyWeilaiUrl(section.sourceImage.url), storageKey: section.sourceImage.storageKey }
                : reference!;
            const result = (
                await retryTransientRequest(
                    () => requestEdit({ ...effectiveConfig, model: imageModel, count: "1", size: ratio }, section.prompt, [generationReference], undefined, { signal: controller.signal }),
                    controller.signal,
                )
            )[0];
            if (!result) throw new Error(t("imageChat.missingResult"));
            if (controller.signal.aborted || runId !== runIdRef.current) return { ...section, status: "canceled" as const, error: t("imageChat.interrupted") };
            const durationMs = performance.now() - sectionStartedAt;
            const resultUrl = proxyWeilaiUrl(result.dataUrl);
            const initialImage = createPendingImage(resultUrl, ratio);
            const assetMetadata = { product: productInfo.trim(), section: section.title, role: section.role, templateId: section.templateId, variantId: section.variantId, packageType, conversionDriver, visualPreset, targetChannel, targetMarket, copyLocale, prompt: section.prompt, model: imageModel, index };
            const assetId = addGeneratedAsset(initialImage, `${productTitle}-${section.title}`, assetMetadata);
            const image: CommerceImage = { ...initialImage, assetId };
            const versions = [...section.versions, image];
            const completed = { ...section, status: "success" as const, image, sourceImage: undefined, versions, activeVersionIndex: versions.length - 1, durationMs, error: undefined };
            updateSections((value) => value.map((item) => (item.id === section.id ? completed : item)));
            localizeGeneratedImage(section.id, image, `${productTitle}-${section.title}`, assetMetadata);
            return completed;
        } catch (error) {
            if (controller.signal.aborted || runId !== runIdRef.current) {
                const canceled = { ...section, status: "canceled" as const, durationMs: performance.now() - sectionStartedAt, error: t("imageChat.interrupted") };
                if (runId === runIdRef.current) updateSections((value) => value.map((item) => (item.id === section.id ? canceled : item)));
                return canceled;
            }
            const failed = { ...section, status: "error" as const, durationMs: performance.now() - sectionStartedAt, error: error instanceof Error ? error.message : t("imageChat.generationFailed") };
            updateSections((value) => value.map((item) => (item.id === section.id ? failed : item)));
            return failed;
        }
    };

    const composeLongImage = async (items = sectionsRef.current, runId = runIdRef.current, preset = exportPreset, showOverlay = overlayEnabled) => {
        if (runId !== runIdRef.current) return;
        const images = items.filter((item): item is CommerceSection & { image: CommerceImage } => Boolean(item.image));
        if (!images.length) return;
        const composeId = ++composeIdRef.current;
        const previous = longImageRef.current;
        setComposing(true);
        setPhase("composing");
        try {
            const sources = images.map((item) => proxyWeilaiUrl(item.image.url));
            const overlays = images.map((item) => ({ enabled: showOverlay, title: item.overlayTitle, body: item.overlayBody }));
            const stored = await uploadImage(await stitchVerticalImages(sources, EXPORT_PRESETS[preset] || EXPORT_PRESETS.taobao, overlays));
            if (runId !== runIdRef.current || composeId !== composeIdRef.current) {
                void deleteStoredImages([stored.storageKey]);
                return;
            }
            const title = `${productTitle}-${t("ecommerce.longImage")}`;
            const metadata = { product: productInfo.trim(), sectionCount: images.length, ratio, preset, width: EXPORT_PRESETS[preset], targetChannel, targetMarket, copyLocale, kind: "detail-long-image" };
            const assetId = previous?.assetId || addGeneratedAsset(stored, title, metadata);
            const nextImage: CommerceImage = { ...stored, assetId, localizationStatus: "success" };
            if (previous?.assetId) updateAsset(previous.assetId, generatedAsset(nextImage, title, metadata));
            replaceLongImage(nextImage);
            if (previous?.assetId && previous.storageKey && previous.storageKey !== stored.storageKey) void deleteStoredImages([previous.storageKey]);
        } catch {
            if (runId === runIdRef.current && composeId === composeIdRef.current) message.error(t("ecommerce.composeFailed"));
        } finally {
            if (composeId === composeIdRef.current) {
                setComposing(false);
                setPhase("idle");
            }
        }
    };

    const generate = async () => {
        if (!projectHydrated || !ensureReady() || running || composing || exporting) return;
        const controller = new AbortController();
        const batchStartedAt = performance.now();
        const runId = ++runIdRef.current;
        composeIdRef.current += 1;
        abortRef.current = controller;
        setRunning(true);
        setPhase("planning");
        setStartedAt(batchStartedAt);
        setElapsedMs(0);
        localizationQueueIdRef.current += 1;
        localizationQueueRef.current = Promise.resolve();
        localizationTasksRef.current.clear();
        replaceSections([]);
        replaceLongImage(null);
        try {
            const visualReference = await imageToDataUrl(reference!);
            if (!visualReference) throw new Error(t("ecommerce.referenceReadFailed"));
            const planningReference = reference!.type === "image/webp" || /^data:image\/(?:x-)?webp/i.test(visualReference) ? await convertImageDataUrl(visualReference) : visualReference;
            let plan: DetailPlanSection[] | null = null;
            try {
                const response = await retryTransientRequest(
                    () =>
                        requestImageQuestion(
                            { ...effectiveConfig, model: textModel },
                            [
                                {
                                    role: "system",
                                    content: t(marketMode === "cross-border" ? "ecommerce.planInstruction" : "ecommerce.domesticPlanInstruction", {
                                        count: sectionCount,
                                        ratio,
                                        packageType: t(`ecommerce.packageTypes.${packageType}`),
                                        packageHint: getPackageSequenceHint(packageType),
                                        conversionDriver: t(`ecommerce.conversionDrivers.${conversionDriver}`),
                                        conversionHint: getConversionHint(conversionDriver),
                                        visualPreset: t(`ecommerce.visualPresets.${visualPreset}`),
                                        marketBrief,
                                        domesticPlatform: t(`ecommerce.presets.${exportPreset}`, { width: EXPORT_PRESETS[exportPreset] }),
                                        templateInstruction:
                                            templateMode === "auto"
                                                ? t("ecommerce.templateAutoInstruction", { catalog: getSceneTemplateCatalog() })
                                                : t("ecommerce.templateManualInstruction", {
                                                      templateId: selectedSceneTemplate.id,
                                                      templateName: selectedSceneTemplate.name,
                                                      variant: selectedSceneTemplate.variants.find(([id]) => id === sceneVariantId)?.[1] || t("ecommerce.variantAuto"),
                                                  }),
                                        styleNotes: styleLock.trim() || t("ecommerce.autoStyleLock"),
                                        proofPoints: proofPoints.trim() || t("ecommerce.noProofPoints"),
                                        roleLibrary: getSceneRoleLibrary(),
                                    }),
                                },
                                {
                                    role: "user",
                                    content: [
                                        { type: "text", text: productInfo.trim() },
                                        { type: "image_url", image_url: { url: planningReference } },
                                    ],
                                },
                            ],
                            () => {},
                            { signal: controller.signal },
                        ),
                    controller.signal,
                );
                plan = parseDetailPlan(response, sectionCount);
                if (!plan) throw new Error(t("ecommerce.planInvalid"));
            } catch (error) {
                if (!isRetryableImageError(error)) throw error;
                plan = createFallbackPlan();
                message.warning(t("ecommerce.planFallback"));
            }
            if (!plan) throw new Error(t("ecommerce.planInvalid"));
            const pending: CommerceSection[] = plan.map((item) => {
                const templateId = templateMode === "manual" ? sceneTemplateId : item.templateId;
                const template = getEcommerceSceneTemplate(templateId);
                const requestedVariantId = templateMode === "manual" && sceneVariantId ? sceneVariantId : item.variantId;
                const variantId = template.variants.some(([id]) => id === requestedVariantId) ? requestedVariantId : "";
                return {
                    title: item.title,
                    role: item.role,
                    templateId,
                    variantId,
                    antiAiEnabled,
                    marketBrief,
                    directionPrompt: item.prompt,
                    styleLock: campaignStyleLock,
                    prompt: buildEcommerceSectionPrompt({ styleLock: campaignStyleLock, role: item.role, templateId, variantId, antiAiEnabled, marketBrief, prompt: item.prompt, productInfo, proofPoints, ratio }),
                    id: nanoid(),
                    status: "pending",
                    versions: [],
                    activeVersionIndex: 0,
                    overlayTitle: item.headline || item.title,
                    overlayBody: item.body,
                };
            });
            replaceSections(pending);
            setPhase("generating");
            const partial = await mapWithConcurrency(pending, 2, (item, index) => generateSection(item, index, controller, runId), controller.signal);
            if (runId !== runIdRef.current) return;
            const latestSections = new Map(sectionsRef.current.map((item) => [item.id, item]));
            const completed = partial.map((item, index) => {
                if (!item) return { ...pending[index], status: "canceled" as const, error: t("imageChat.interrupted") };
                const latest = latestSections.get(item.id);
                return latest?.image?.assetId === item.image?.assetId ? latest : item;
            });
            replaceSections(completed);
            if (controller.signal.aborted) {
                setPhase("idle");
                message.info(t("imageChat.interrupted"));
                return;
            }
            const succeeded = completed.filter((item): item is CommerceSection & { image: CommerceImage } => item.status === "success" && Boolean(item.image));
            if (succeeded.length) {
                abortRef.current = null;
                setRunning(false);
                setPhase("idle");
                const generationDurationMs = performance.now() - batchStartedAt;
                const localizationTasks = succeeded.map((item) => localizationTasksRef.current.get(item.image.assetId || "") || Promise.resolve(item.image));
                void Promise.all(localizationTasks).then((localizedImages) => {
                    const images = localizedImages
                        .map((image, index) => ({ image: image || succeeded[index].image, durationMs: succeeded[index].durationMs || 0 }))
                        .filter(({ image }) => image.storageKey || !image.url.startsWith("data:"));
                    return saveImageGenerationLog({
                        prompt: productInfo.trim(),
                        model: imageModel,
                        config: { ...effectiveConfig, size: ratio },
                        references: [reference!],
                        durationMs: generationDurationMs,
                        requestedCount: sectionCount,
                        images,
                    });
                }).catch(() => message.warning(t("imageChat.historySaveFailed")));
                void composeLongImage(completed, runId);
            }
            if (!succeeded.length) setPhase("idle");
            if (runId === runIdRef.current) message.success(t("ecommerce.generatedSummary", { success: succeeded.length, total: sectionCount }));
        } catch (error) {
            if (runId !== runIdRef.current) return;
            setPhase("idle");
            if (controller.signal.aborted) {
                message.info(t("imageChat.interrupted"));
            } else message.error(error instanceof Error ? error.message : t("ecommerce.generationFailed"));
        } finally {
            if (runId === runIdRef.current) {
                abortRef.current = null;
                setRunning(false);
            }
        }
    };

    const retrySection = async (section: CommerceSection, index: number, prompt = section.prompt, sourceImage = section.sourceImage, directionPrompt = section.directionPrompt) => {
        if (!ensureReady(false) || running || composing || exporting) return;
        const nextPrompt = prompt.trim();
        if (!nextPrompt) {
            message.warning(t("ecommerce.editPromptRequired"));
            return;
        }
        const controller = new AbortController();
        const runId = ++runIdRef.current;
        composeIdRef.current += 1;
        abortRef.current = controller;
        setRunning(true);
        setPhase("editing");
        setStartedAt(performance.now());
        setElapsedMs(0);
        updateSections((value) => value.map((item) => (item.id === section.id ? { ...item, prompt: nextPrompt, directionPrompt, status: "pending", sourceImage, error: undefined, durationMs: undefined } : item)));
        try {
            const result = await generateSection({ ...section, prompt: nextPrompt, directionPrompt, status: "pending", sourceImage, error: undefined }, index, controller, runId);
            if (runId !== runIdRef.current) return;
            const latest = sectionsRef.current.find((item) => item.id === result.id);
            const current = latest?.image?.assetId === result.image?.assetId ? latest : result;
            const completed: CommerceSection = current.status === "canceled" && current.image ? { ...current, status: "success", sourceImage: undefined, error: undefined } : current;
            const nextSections = updateSections((value) => value.map((item) => (item.id === section.id ? completed : item)));
            if (controller.signal.aborted) {
                setPhase("idle");
                message.info(t("imageChat.interrupted"));
                if (completed.image) void composeLongImage(nextSections, runId);
            } else if (completed.status === "success") {
                abortRef.current = null;
                setRunning(false);
                setPhase("idle");
                void composeLongImage(nextSections, runId);
            } else {
                setPhase("idle");
                if (completed.image) void composeLongImage(nextSections, runId);
            }
        } finally {
            if (runId === runIdRef.current) {
                abortRef.current = null;
                setRunning(false);
            }
        }
    };

    const openSectionEditor = (section: CommerceSection) => {
        setEditTargetId(section.id);
        setEditPrompt(section.directionPrompt);
    };

    const regenerateEditedSection = () => {
        const index = sectionsRef.current.findIndex((item) => item.id === editTargetId);
        const section = sectionsRef.current[index];
        if (!section || !section.image) return;
        if (!editPrompt.trim()) {
            message.warning(t("ecommerce.editPromptRequired"));
            return;
        }
        setEditTargetId(null);
        const directionPrompt = editPrompt.trim();
        const prompt = buildEcommerceSectionPrompt({ styleLock: section.styleLock, role: section.role, templateId: section.templateId, variantId: section.variantId, antiAiEnabled: section.antiAiEnabled, marketBrief: section.marketBrief, prompt: directionPrompt, productInfo, proofPoints, ratio });
        void retrySection(section, index, prompt, section.image, directionPrompt);
    };

    const recompose = (nextSections: CommerceSection[], preset = exportPreset, showOverlay = overlayEnabled) => {
        if (nextSections.some((item) => item.image)) void composeLongImage(nextSections, runIdRef.current, preset, showOverlay);
    };

    const retryLocalization = (section: CommerceSection, index: number) => {
        if (!section.image || section.image.storageKey || section.image.localizationStatus === "pending") return;
        const title = `${productTitle}-${section.title}`;
        localizeGeneratedImage(section.id, section.image, title, { product: productInfo.trim(), section: section.title, role: section.role, templateId: section.templateId, variantId: section.variantId, packageType, conversionDriver, visualPreset, targetChannel, targetMarket, copyLocale, prompt: section.prompt, model: imageModel, index });
    };

    const moveSection = (index: number, offset: number) => {
        const target = index + offset;
        if (target < 0 || target >= sectionsRef.current.length || running || composing || exporting) return;
        const next = [...sectionsRef.current];
        [next[index], next[target]] = [next[target], next[index]];
        replaceSections(next);
        recompose(next);
    };

    const removeSection = (section: CommerceSection) => {
        modal.confirm({
            title: t("ecommerce.deleteSectionTitle"),
            content: t("ecommerce.deleteSectionConfirm", { title: section.title }),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: () => {
                if (busyRef.current) return;
                const next = sectionsRef.current.filter((item) => item.id !== section.id);
                replaceSections(next);
                recompose(next);
            },
        });
    };

    const selectVersion = (section: CommerceSection, activeVersionIndex: number) => {
        const image = section.versions[activeVersionIndex];
        if (!image || activeVersionIndex === section.activeVersionIndex || running || composing || exporting) return;
        const next = updateSections((value) => value.map((item) => (item.id === section.id ? { ...item, image, activeVersionIndex, status: "success", sourceImage: undefined, error: undefined } : item)));
        recompose(next);
    };

    const openCopyEditor = (section: CommerceSection) => {
        setCopyTargetId(section.id);
        setCopyTitle(section.overlayTitle);
        setCopyBody(section.overlayBody);
    };

    const saveSectionCopy = () => {
        const target = sectionsRef.current.find((item) => item.id === copyTargetId);
        if (!target) return;
        const next = updateSections((value) => value.map((item) => (item.id === target.id ? { ...item, overlayTitle: copyTitle.trim(), overlayBody: copyBody.trim() } : item)));
        setCopyTargetId(null);
        if (overlayEnabled) recompose(next);
    };

    const changeRatio = (value: string) => {
        if (value === ratio || running || composing || exporting) return;
        if (!sectionsRef.current.length) {
            setRatio(value);
            return;
        }
        modal.confirm({
            title: t("ecommerce.changeRatioTitle"),
            content: t("ecommerce.changeRatioConfirm"),
            cancelText: t("common.cancel"),
            onOk: () => {
                if (busyRef.current) return;
                invalidateWork();
                setRatio(value);
                replaceSections([]);
                replaceLongImage(null);
            },
        });
    };

    const changeOverlayEnabled = (enabled: boolean) => {
        if (exporting) return;
        setOverlayEnabled(enabled);
        recompose(sectionsRef.current, exportPreset, enabled);
    };

    const changeExportPreset = (preset: string) => {
        if (exporting) return;
        setExportPreset(preset);
        recompose(sectionsRef.current, preset);
    };

    const exportSlices = async () => {
        if (!longImage || exporting || running || composing) return;
        setExporting(true);
        setPhase("exporting");
        try {
            const slices = await sliceVerticalImage(longImage.url, sliceHeight);
            const zip = await createZip(slices.map((data, index) => ({ name: `${productTitle}-${String(index + 1).padStart(2, "0")}.jpg`, data })));
            saveAs(zip, `${productTitle}-${t("ecommerce.slicedPackage")}.zip`);
            message.success(t("ecommerce.exportedSlices", { count: slices.length }));
        } catch {
            message.error(t("ecommerce.exportFailed"));
        } finally {
            setExporting(false);
            setPhase("idle");
        }
    };

    const successfulSections = sections.filter((item) => item.image);
    const busy = running || composing || exporting;
    const phaseLabel = phase === "idle" ? "" : t(`ecommerce.phases.${phase}`, { time: formatDuration(elapsedMs) });

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-background text-foreground lg:flex lg:overflow-hidden">
            <aside className="thin-scrollbar w-full border-b border-border p-4 lg:h-full lg:w-[360px] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-5">
                <div className="mb-5">
                    <h1 className="text-lg font-semibold">{t("ecommerce.title")}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t("ecommerce.subtitle")}</p>
                </div>

                <section>
                    <div className="mb-2 text-sm font-medium">{t("ecommerce.productImage")}</div>
                    <div className="relative">
                        <button type="button" className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/20 transition hover:bg-muted/40" onClick={() => fileInputRef.current?.click()}>
                            {reference ? <Image preview={false} src={reference.dataUrl} alt={reference.name} className="h-full w-full object-contain" /> : <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><Upload className="size-5" />{t("ecommerce.uploadProduct")}</span>}
                        </button>
                        {reference ? (
                            <Tooltip title={t("ecommerce.removeProduct")}>
                                <Button type="text" shape="circle" size="small" className="!absolute !right-2 !top-2 !bg-background/85" icon={<X className="size-4" />} onClick={() => { invalidateWork(); setReference(null); replaceSections([]); replaceLongImage(null); }} aria-label={t("ecommerce.removeProduct")} />
                            </Tooltip>
                        ) : null}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void selectReference(event.target.files?.[0]); event.target.value = ""; }} />
                </section>

                <section className="mt-5 border-t border-border pt-5">
                    <div className="mb-2 text-sm font-medium">{t("ecommerce.productInfo")}</div>
                    <Input.TextArea value={productInfo} onChange={(event) => setProductInfo(event.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} placeholder={t("ecommerce.productInfoPlaceholder")} />
                </section>

                <section className="mt-5 space-y-3 border-t border-border pt-5">
                    <div className="text-sm font-medium">{t("ecommerce.creativeStrategy")}</div>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-sm">
                            <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.packageType")}</span>
                            <Select className="w-full" value={packageType} disabled={busy} onChange={(value) => setPackageType(value)} options={ECOMMERCE_PACKAGE_TYPES.map((value) => ({ value, label: t(`ecommerce.packageTypes.${value}`) }))} />
                        </label>
                        <label className="text-sm">
                            <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.conversionDriver")}</span>
                            <Select className="w-full" value={conversionDriver} disabled={busy} onChange={(value) => setConversionDriver(value)} options={ECOMMERCE_CONVERSION_DRIVERS.map((value) => ({ value, label: t(`ecommerce.conversionDrivers.${value}`) }))} />
                        </label>
                    </div>
                    <label className="block text-sm">
                        <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.visualPreset")}</span>
                        <Select className="w-full" value={visualPreset} disabled={busy} onChange={(value) => setVisualPreset(value)} options={ECOMMERCE_VISUAL_PRESETS.map((value) => ({ value, label: t(`ecommerce.visualPresets.${value}`) }))} />
                    </label>
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-xs text-muted-foreground">{t("ecommerce.sceneTemplate")}</span>
                        <Segmented size="small" value={templateMode} disabled={busy} onChange={(value) => setTemplateMode(String(value) as EcommerceTemplateMode)} options={[{ value: "auto", label: t("ecommerce.templateModes.auto") }, { value: "manual", label: t("ecommerce.templateModes.manual") }]} />
                    </div>
                    {templateMode === "manual" ? (
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-sm">
                                <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.sceneTemplate")}</span>
                                <Select showSearch optionFilterProp="label" className="w-full" value={sceneTemplateId} disabled={busy} onChange={(value) => { setSceneTemplateId(value); setSceneVariantId(""); }} options={sceneTemplateOptions} />
                            </label>
                            <label className="text-sm">
                                <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.sceneVariant")}</span>
                                <Select className="w-full" value={sceneVariantId} disabled={busy} onChange={setSceneVariantId} options={[{ value: "", label: t("ecommerce.variantAuto") }, ...selectedSceneTemplate.variants.map(([value, label]) => ({ value, label }))]} />
                            </label>
                        </div>
                    ) : <p className="text-xs leading-5 text-muted-foreground">{t("ecommerce.templateAutoDescription")}</p>}
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-xs text-muted-foreground">{t("ecommerce.antiAiTreatment")}</span>
                        <Switch size="small" checked={antiAiEnabled} disabled={busy} onChange={setAntiAiEnabled} />
                    </div>
                    <label className="block text-sm">
                        <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.styleLock")}</span>
                        <Input.TextArea value={styleLock} disabled={busy} onChange={(event) => setStyleLock(event.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder={t("ecommerce.styleLockPlaceholder")} />
                    </label>
                    <label className="block text-sm">
                        <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.proofPoints")}</span>
                        <Input.TextArea value={proofPoints} disabled={busy} onChange={(event) => setProofPoints(event.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder={t("ecommerce.proofPointsPlaceholder")} />
                    </label>
                </section>

                <section className="mt-5 space-y-3 border-t border-border pt-5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{t("ecommerce.marketMode")}</span>
                        <Segmented size="small" value={marketMode} disabled={busy} onChange={(value) => setMarketMode(String(value) as EcommerceMarketMode)} options={[{ value: "domestic", label: t("ecommerce.marketModes.domestic") }, { value: "cross-border", label: t("ecommerce.marketModes.crossBorder") }]} />
                    </div>
                    {marketMode === "cross-border" && <>
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-xs text-muted-foreground">{t("ecommerce.crossBorderStrategy")}</span>
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">{t("ecommerce.complianceReview")}<Switch size="small" checked={complianceEnabled} disabled={busy} onChange={setComplianceEnabled} /></span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-sm">
                                <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.targetChannel")}</span>
                                <Select className="w-full" value={targetChannel} disabled={busy} onChange={setTargetChannel} options={ECOMMERCE_CHANNELS.map((value) => ({ value, label: t(`ecommerce.channels.${value}`) }))} />
                            </label>
                            <label className="text-sm">
                                <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.targetMarket")}</span>
                                <Select className="w-full" value={targetMarket} disabled={busy} onChange={setTargetMarket} options={ECOMMERCE_MARKETS.map((value) => ({ value, label: t(`ecommerce.markets.${value}`) }))} />
                            </label>
                        </div>
                        <label className="block text-sm">
                            <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.copyLocale")}</span>
                            <Select className="w-full" value={copyLocale} disabled={busy} onChange={setCopyLocale} options={ECOMMERCE_COPY_LOCALES.map((value) => ({ value, label: t(`ecommerce.copyLocales.${value}`) }))} />
                        </label>
                        <label className="block text-sm">
                            <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.audienceProfile")}</span>
                            <Input.TextArea value={audienceProfile} disabled={busy} onChange={(event) => setAudienceProfile(event.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder={t("ecommerce.audienceProfilePlaceholder")} />
                        </label>
                        <label className="block text-sm">
                            <span className="mb-2 block text-xs text-muted-foreground">{t("ecommerce.offerDetails")}</span>
                            <Input.TextArea value={offerDetails} disabled={busy} onChange={(event) => setOfferDetails(event.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder={t("ecommerce.offerDetailsPlaceholder")} />
                        </label>
                    </>}
                </section>

                <section className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-5">
                    <label className="text-sm">
                        <span className="mb-2 block font-medium">{t("ecommerce.sectionCount")}</span>
                        <InputNumber className="w-full" min={3} max={8} value={sectionCount} onChange={(value) => setSectionCount(Number(value) || 5)} />
                    </label>
                    <label className="text-sm">
                        <span className="mb-2 block font-medium">{t("ecommerce.ratio")}</span>
                        <Segmented block value={ratio} disabled={busy} onChange={(value) => changeRatio(String(value))} options={["1:1", "2:3", "3:4", "9:16"]} />
                    </label>
                </section>

                <section className="mt-5 space-y-3 border-t border-border pt-5">
                    <label className="block text-sm">
                        <span className="mb-2 block font-medium">{t("ecommerce.imageModel")}</span>
                        <ModelPicker fullWidth config={config} value={imageModel} capability="image" onChange={(value) => updateConfig("imageModel", value)} onMissingConfig={() => openConfigDialog(true)} />
                    </label>
                    <label className="block text-sm">
                        <span className="mb-2 block font-medium">{t("ecommerce.planningModel")}</span>
                        <ModelPicker fullWidth config={config} value={textModel} capability="text" onChange={(value) => updateConfig("textModel", value)} onMissingConfig={() => openConfigDialog(true)} />
                    </label>
                </section>

                <section className="mt-5 space-y-3 border-t border-border pt-5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{t("ecommerce.copyOverlay")}</span>
                        <Switch size="small" checked={overlayEnabled} disabled={busy} onChange={changeOverlayEnabled} />
                    </div>
                    <label className="block text-sm">
                        <span className="mb-2 block font-medium">{t("ecommerce.platformPreset")}</span>
                        <Select
                            className="w-full"
                            value={exportPreset}
                            disabled={busy}
                            onChange={changeExportPreset}
                            options={Object.keys(EXPORT_PRESETS).map((value) => ({ value, label: t(`ecommerce.presets.${value}`, { width: EXPORT_PRESETS[value] }) }))}
                        />
                    </label>
                    <label className="block text-sm">
                        <span className="mb-2 block font-medium">{t("ecommerce.sliceHeight")}</span>
                        <InputNumber className="w-full" min={500} max={10000} step={100} value={sliceHeight} disabled={busy} onChange={(value) => setSliceHeight(Number(value) || 2000)} addonAfter="px" />
                    </label>
                </section>

                <Button type="primary" block size="large" className="mt-5" disabled={!projectHydrated || running || composing || exporting} icon={phase !== "idle" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} onClick={() => void generate()}>
                    {phaseLabel || t("ecommerce.generate")}
                </Button>
            </aside>

            <main className="thin-scrollbar min-h-[480px] overflow-visible lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:px-6">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t("ecommerce.detailPreview")}</div>
                        <div className="truncate text-xs text-muted-foreground">{phaseLabel || `${modelOptionLabel(config, imageModel)} · ${ratio} · ${EXPORT_PRESETS[exportPreset]}px`}</div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Tooltip title={t("ecommerce.compose")}>
                            <Button type="text" loading={composing} disabled={!successfulSections.length || running || composing || exporting} icon={<Combine className="size-4" />} onClick={() => void composeLongImage()}>{t("ecommerce.compose")}</Button>
                        </Tooltip>
                        {running ? <Tooltip title={t("imageChat.stop")}><Button type="text" danger icon={<Square className="size-3.5 fill-current" />} onClick={stopGeneration} aria-label={t("imageChat.stop")} /></Tooltip> : null}
                    </div>
                </header>

                {!sections.length ? (
                    <div className="flex min-h-[calc(100%-56px)] flex-col items-center justify-center px-6 py-16 text-center">
                        <ImagePlus className="size-9 text-muted-foreground" />
                        <h2 className="mt-4 text-base font-semibold">{t("ecommerce.emptyTitle")}</h2>
                        <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("ecommerce.emptyDescription")}</p>
                    </div>
                ) : (
                    <div className="grid items-start gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                            {sections.map((section, index) => (
                                <article key={section.id} className="overflow-hidden rounded-md border border-border bg-card">
                                    <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-medium">{index + 1}. {section.title}</div>
                                            <div className="mt-0.5 truncate text-xs text-muted-foreground">{t(`ecommerce.sceneRoles.${section.role}`)} · {getSceneTemplateLabel(section.templateId, section.variantId)} · {section.durationMs === undefined ? t("ecommerce.waiting") : formatDuration(section.durationMs)}</div>
                                        </div>
                                        <div className="flex shrink-0 items-center">
                                            <Tooltip title={t("ecommerce.moveUp")}><Button type="text" size="small" disabled={index === 0 || busy} icon={<ArrowUp className="size-3.5" />} onClick={() => moveSection(index, -1)} aria-label={t("ecommerce.moveUp")} /></Tooltip>
                                            <Tooltip title={t("ecommerce.moveDown")}><Button type="text" size="small" disabled={index === sections.length - 1 || busy} icon={<ArrowDown className="size-3.5" />} onClick={() => moveSection(index, 1)} aria-label={t("ecommerce.moveDown")} /></Tooltip>
                                            <Tooltip title={t("common.delete")}><Button type="text" size="small" danger disabled={busy} icon={<Trash2 className="size-3.5" />} onClick={() => removeSection(section)} aria-label={t("common.delete")} /></Tooltip>
                                            {section.status === "success" ? <Check className="ml-1 size-4" /> : section.status === "pending" && running ? <LoaderCircle className="ml-1 size-4 animate-spin" /> : section.status === "error" ? <Tooltip title={section.error}><X className="ml-1 size-4 text-red-500" /></Tooltip> : null}
                                        </div>
                                    </div>
                                    <div className={`relative flex items-center justify-center overflow-hidden bg-muted/20 ${ratio === "9:16" ? "aspect-[9/16]" : "aspect-[3/4]"}`}>
                                        {section.image ? <Image width="100%" src={section.image.url} alt={section.title} className="block h-full w-full object-contain" /> : section.status === "error" || section.status === "canceled" ? <div className={`px-5 text-center text-sm ${section.status === "error" ? "text-red-600 dark:text-red-300" : "text-muted-foreground"}`}><div>{section.error || t("imageChat.interrupted")}</div><Button type="text" danger={section.status === "error"} size="small" className="mt-2" disabled={busy} icon={<RefreshCw className="size-4" />} onClick={() => void retrySection(section, index)}>{t("imageChat.retry")}</Button></div> : <ImageGenerationPlaceholder />}
                                        {section.image && overlayEnabled && (section.overlayTitle || section.overlayBody) ? <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-white"><div className="text-sm font-semibold">{section.overlayTitle}</div>{section.overlayBody ? <div className="mt-1 line-clamp-3 text-xs leading-5 text-white/85">{section.overlayBody}</div> : null}</div> : null}
                                        {section.image && section.status === "pending" ? <div className="absolute inset-0"><ImageGenerationPlaceholder overlay /></div> : null}
                                    </div>
                                    <div className="px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="line-clamp-2 min-w-0 text-xs leading-5 text-muted-foreground">{section.prompt}</p>
                                            {section.image ? <div className="flex shrink-0 items-center">{section.status === "error" ? <Tooltip title={t("imageChat.retry")}><Button type="text" danger size="small" disabled={busy} icon={<RefreshCw className="size-4" />} onClick={() => void retrySection(section, index)} aria-label={t("imageChat.retry")} /></Tooltip> : null}{!section.image.storageKey ? <Tooltip title={t(section.image.localizationStatus === "pending" ? "ecommerce.localizing" : "ecommerce.localizeRetry")}><Button type="text" size="small" loading={section.image.localizationStatus === "pending"} disabled={section.image.localizationStatus === "pending"} icon={<HardDriveDownload className="size-4" />} onClick={() => retryLocalization(section, index)} aria-label={t("ecommerce.localizeRetry")} /></Tooltip> : null}<Tooltip title={t("ecommerce.editCopy")}><Button type="text" size="small" disabled={busy} icon={<Type className="size-4" />} onClick={() => openCopyEditor(section)} aria-label={t("ecommerce.editCopy")} /></Tooltip><Tooltip title={t("ecommerce.editSection")}><Button type="text" size="small" disabled={busy} icon={<Pencil className="size-4" />} onClick={() => openSectionEditor(section)} aria-label={t("ecommerce.editSection")} /></Tooltip><Tooltip title={t("common.download")}><Button type="text" size="small" icon={<Download className="size-4" />} onClick={() => saveAs(section.image!.url, `detail-${index + 1}.${section.image!.mimeType.split("/")[1]?.split(";")[0] || "png"}`)} aria-label={t("common.download")} /></Tooltip></div> : null}
                                        </div>
                                        {section.versions.length > 1 ? <div className="mt-2 flex items-center justify-end border-t border-border pt-1"><Tooltip title={t("ecommerce.previousVersion")}><Button type="text" size="small" disabled={section.activeVersionIndex === 0 || busy} icon={<ChevronLeft className="size-4" />} onClick={() => selectVersion(section, section.activeVersionIndex - 1)} aria-label={t("ecommerce.previousVersion")} /></Tooltip><span className="min-w-10 text-center text-xs text-muted-foreground">{section.activeVersionIndex + 1}/{section.versions.length}</span><Tooltip title={t("ecommerce.nextVersion")}><Button type="text" size="small" disabled={section.activeVersionIndex === section.versions.length - 1 || busy} icon={<ChevronRight className="size-4" />} onClick={() => selectVersion(section, section.activeVersionIndex + 1)} aria-label={t("ecommerce.nextVersion")} /></Tooltip></div> : null}
                                    </div>
                                </article>
                            ))}
                        </div>

                        <aside className="xl:sticky xl:top-20">
                            <div className="mb-3 flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium">{t("ecommerce.longImage")}</div>
                                    <div className="text-xs text-muted-foreground">{t("ecommerce.longImageCount", { count: successfulSections.length })}</div>
                                </div>
                                {longImage ? <div className="flex items-center"><Tooltip title={t("ecommerce.exportSlices")}><Button type="text" loading={exporting} disabled={composing} icon={<FileArchive className="size-4" />} onClick={() => void exportSlices()} aria-label={t("ecommerce.exportSlices")} /></Tooltip><Tooltip title={t("common.download")}><Button type="text" icon={<Download className="size-4" />} onClick={() => saveAs(longImage.url, `${productTitle}-detail.jpg`)} aria-label={t("common.download")} /></Tooltip></div> : null}
                            </div>
                            <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20">
                                {longImage ? <Image width="100%" src={longImage.url} alt={t("ecommerce.longImage")} className="block w-full object-contain" /> : composing ? <span className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("ecommerce.composing")}</span> : <span className="px-6 text-center text-sm text-muted-foreground">{t("ecommerce.longImageEmpty")}</span>}
                            </div>
                        </aside>
                    </div>
                )}
            </main>
            <Modal title={t("ecommerce.editSectionTitle")} open={Boolean(editTargetId)} okText={t("ecommerce.regenerateSection")} cancelText={t("common.cancel")} okButtonProps={{ disabled: busy }} onOk={regenerateEditedSection} onCancel={() => setEditTargetId(null)} destroyOnHidden>
                <Input.TextArea value={editPrompt} onChange={(event) => setEditPrompt(event.target.value)} autoSize={{ minRows: 6, maxRows: 12 }} placeholder={t("ecommerce.editPromptPlaceholder")} />
            </Modal>
            <Modal title={t("ecommerce.editCopyTitle")} open={Boolean(copyTargetId)} okText={t("common.save")} cancelText={t("common.cancel")} okButtonProps={{ disabled: busy }} onOk={saveSectionCopy} onCancel={() => setCopyTargetId(null)} destroyOnHidden>
                <div className="space-y-4">
                    <label className="block text-sm"><span className="mb-2 block font-medium">{t("ecommerce.overlayTitle")}</span><Input value={copyTitle} onChange={(event) => setCopyTitle(event.target.value)} maxLength={40} /></label>
                    <label className="block text-sm"><span className="mb-2 block font-medium">{t("ecommerce.overlayBody")}</span><Input.TextArea value={copyBody} onChange={(event) => setCopyBody(event.target.value)} autoSize={{ minRows: 3, maxRows: 7 }} maxLength={160} /></label>
                </div>
            </Modal>
        </div>
    );
}
