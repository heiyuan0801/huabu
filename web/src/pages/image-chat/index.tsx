import { App, Button, Drawer, Dropdown, Image, Input, Select, Tooltip } from "antd";
import { ArrowUp, BookOpenText, Check, Copy, Download, Ellipsis, ImagePlus, LoaderCircle, Menu, MessageSquarePlus, RefreshCw, Search, Square, Trash2, WandSparkles, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { ImageGenerationPlaceholder } from "@/components/image-generation-placeholder";
import { useCopyText } from "@/hooks/use-copy-text";
import { formatDuration, getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { saveImageGenerationLog } from "@/services/image-generation-log";
import { deleteStoredImages, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelOptionLabel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import { buildImageChatSkillPrompt, IMAGE_CHAT_SKILL_IDS, IMAGE_CHAT_SKILL_SIZE, type ImageChatSkillId } from "./image-chat-skills";
import { type ImageChatImage, type ImageChatMessage, type ImageChatSession, useImageChatHistory } from "./use-image-chat";

export default function ImageChatPage() {
    const { message, modal } = App.useApp();
    const { t, i18n } = useTranslation();
    const copyText = useCopyText();
    const effectiveConfig = useEffectiveConfig();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const history = useImageChatHistory();
    const [prompt, setPrompt] = useState("");
    const [selectedSkillId, setSelectedSkillId] = useState<ImageChatSkillId | "">("");
    const [reference, setReference] = useState<ReferenceImage | null>(null);
    const [uploadingReference, setUploadingReference] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [runningMessageId, setRunningMessageId] = useState<string | null>(null);
    const [polishing, setPolishing] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const polishAbortRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const textModel = effectiveConfig.textModel || effectiveConfig.model;
    const activeMessages = history.activeSession?.messages || [];
    const canSubmit = selectedSkillId ? Boolean(reference) : Boolean(prompt.trim());

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [activeMessages.length, activeMessages.at(-1)?.status]);

    useEffect(
        () => () => {
            abortRef.current?.abort();
            polishAbortRef.current?.abort();
        },
        [],
    );

    const runGeneration = async (sessionId: string, assistantMessageId: string, text: string, displayText: string, targetModel: string, references: ReferenceImage[] = [], skillId?: ImageChatSkillId) => {
        const controller = new AbortController();
        const startedAt = performance.now();
        abortRef.current = controller;
        setRunningMessageId(assistantMessageId);

        try {
            const generationConfig = { ...effectiveConfig, model: targetModel, count: "1", ...(skillId ? { size: IMAGE_CHAT_SKILL_SIZE } : {}) };
            const images = references.length
                ? await requestEdit(generationConfig, text, references, undefined, { signal: controller.signal })
                : await requestGeneration(generationConfig, text, { signal: controller.signal });
            const result = images[0];
            if (!result) throw new Error(t("imageChat.missingResult"));
            const durationMs = performance.now() - startedAt;
            const meta = await readImageMeta(result.dataUrl);
            let image: ImageChatImage = { url: result.dataUrl, width: meta.width, height: meta.height, bytes: getDataUrlByteSize(result.dataUrl), mimeType: meta.mimeType };
            history.finishGeneration(sessionId, assistantMessageId, { status: "success", image, durationMs, error: undefined });
            try {
                image = await uploadImage(result.dataUrl);
                history.finishGeneration(sessionId, assistantMessageId, { image });
            } catch {
                // Remote images may be viewable but blocked from being fetched into IndexedDB by CORS.
            }
            addAsset({
                kind: "image",
                title: displayText.slice(0, 24) || t("imageChat.generatedImage"),
                coverUrl: image.url,
                tags: [],
                source: t("imageChat.title"),
                data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType },
                metadata: { source: "image-chat", prompt: text, model: targetModel, skillId },
            });
            try {
                await saveImageGenerationLog({ prompt: text, model: targetModel, config: generationConfig, references, durationMs, requestedCount: 1, images: [{ image, durationMs }] });
            } catch {
                message.warning(t("imageChat.historySaveFailed"));
            }
        } catch (error) {
            history.finishGeneration(sessionId, assistantMessageId, { status: "error", durationMs: performance.now() - startedAt, error: error instanceof Error ? error.message : t("imageChat.generationFailed") });
        } finally {
            abortRef.current = null;
            setRunningMessageId(null);
        }
    };

    const generate = async (value = prompt, sessionId = history.activeSession?.id) => {
        const text = value.trim();
        if (!sessionId || runningMessageId || polishing) return;
        if (selectedSkillId && !reference) {
            message.warning(t("imageChat.referenceRequired"));
            return;
        }
        if (!selectedSkillId && !text) return;
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("imageChat.configRequired"));
            openConfigDialog(true);
            return;
        }

        const skillId = selectedSkillId || undefined;
        const references = reference ? [reference] : [];
        const requestPrompt = skillId ? buildImageChatSkillPrompt(skillId, text) : text;
        const displayText = text || (skillId ? t(`imageChat.skills.${skillId}`) : t("imageChat.generatedImage"));
        const assistantMessageId = history.beginGeneration(sessionId, { displayText, requestPrompt, model, references, skillId });
        setPrompt("");
        setReference(null);
        await runGeneration(sessionId, assistantMessageId, requestPrompt, displayText, model, references, skillId);
    };

    const retryGeneration = async (item: ImageChatMessage, text: string) => {
        const sessionId = history.activeSession?.id;
        if (!sessionId || runningMessageId || polishing) return;
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("imageChat.configRequired"));
            openConfigDialog(true);
            return;
        }
        history.finishGeneration(sessionId, item.id, { status: "pending", model, image: undefined, error: undefined, durationMs: undefined, createdAt: Date.now() });
        const requestPrompt = item.requestPrompt || text;
        await runGeneration(sessionId, item.id, requestPrompt, text, model, item.references || [], item.skillId);
    };

    const addReference = async (files?: FileList | null) => {
        const file = Array.from(files || []).find((item) => item.type.startsWith("image/"));
        if (!file) return;
        setUploadingReference(true);
        try {
            const image = await uploadImage(file);
            const previousStorageKey = reference?.storageKey;
            setReference({ id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey });
            if (previousStorageKey) void deleteStoredImages([previousStorageKey]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("common.imageReadFailed"));
        } finally {
            setUploadingReference(false);
        }
    };

    const removeReference = () => {
        if (reference?.storageKey) void deleteStoredImages([reference.storageKey]);
        setReference(null);
    };

    const polishAndGenerate = async () => {
        const text = prompt.trim();
        const sessionId = history.activeSession?.id;
        if (!text || !sessionId || polishing || runningMessageId) return;
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("imageChat.configRequired"));
            openConfigDialog(true);
            return;
        }
        if (!isAiConfigReady(effectiveConfig, textModel)) {
            message.warning(t("imageChat.textConfigRequired"));
            openConfigDialog(true);
            return;
        }
        const controller = new AbortController();
        polishAbortRef.current = controller;
        setPolishing(true);
        try {
            const polished = (
                await requestImageQuestion(
                    { ...effectiveConfig, model: textModel },
                    [
                        { role: "system", content: t("imageChat.polishInstruction") },
                        { role: "user", content: text },
                    ],
                    () => {},
                    { signal: controller.signal },
                )
            ).trim();
            if (!polished) throw new Error(t("imageChat.polishEmpty"));
            setPrompt(polished);
            setPolishing(false);
            await generate(polished, sessionId);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("imageChat.polishFailed"));
        } finally {
            polishAbortRef.current = null;
            setPolishing(false);
        }
    };

    const deleteSession = (session: ImageChatSession) => {
        modal.confirm({
            title: t("imageChat.deleteTitle"),
            content: t("imageChat.deleteConfirm", { name: session.title || t("imageChat.untitled") }),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: () => history.removeSession(session.id),
        });
    };

    const sidebar = (
        <ConversationSidebar
            sessions={history.sessions}
            activeSessionId={history.activeSessionId}
            locale={i18n.language}
            onCreate={() => {
                history.addSession();
                setPrompt("");
                removeReference();
                setHistoryOpen(false);
            }}
            onSelect={(id) => {
                history.selectSession(id);
                setPrompt("");
                removeReference();
                setHistoryOpen(false);
            }}
            onDelete={deleteSession}
        />
    );

    return (
        <div className="flex h-full min-h-0 bg-background text-foreground">
            <aside className="hidden w-[284px] shrink-0 border-r border-border bg-muted/25 lg:flex">{sidebar}</aside>
            <Drawer title={t("imageChat.history")} placement="left" size={284} open={historyOpen} onClose={() => setHistoryOpen(false)} className="lg:hidden" styles={{ body: { padding: 0 } }}>
                {sidebar}
            </Drawer>

            <section className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
                    <div className="flex min-w-0 items-center gap-2">
                        <Tooltip title={t("imageChat.history")}>
                            <Button type="text" className="lg:!hidden" icon={<Menu className="size-4" />} onClick={() => setHistoryOpen(true)} aria-label={t("imageChat.history")} />
                        </Tooltip>
                        <h1 className="truncate text-base font-semibold">{history.activeSession?.title || t("imageChat.title")}</h1>
                    </div>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">{modelOptionLabel(config, model)}</span>
                </header>

                <main className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
                    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col py-8 md:py-10">
                        {activeMessages.length ? (
                            <div className="space-y-8">
                                {activeMessages.map((item, index) => {
                                    const previousUserText = findPreviousPrompt(activeMessages, index);
                                    const promptText = item.role === "assistant" ? item.requestPrompt || previousUserText : item.content;
                                    return item.role === "user" ? (
                                        <UserMessage key={item.id} content={item.content} references={item.references} skillLabel={item.skillId ? t(`imageChat.skills.${item.skillId}`) : ""} onCopy={() => copyText(item.content)} />
                                    ) : (
                                        <AssistantMessage
                                            key={item.id}
                                            item={item}
                                            modelLabel={item.model ? modelOptionLabel(config, item.model) : ""}
                                            prompt={promptText}
                                            onDownload={() => item.image && saveAs(item.image.url, `image-chat-${item.id}.png`)}
                                            onRetry={() => void retryGeneration(item, previousUserText)}
                                        />
                                    );
                                })}
                                <div ref={endRef} />
                            </div>
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
                                <span
                                    className="mb-5 size-11 bg-foreground"
                                    style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }}
                                />
                                <h2 className="text-xl font-semibold">{t("imageChat.emptyTitle")}</h2>
                                <p className="mt-2 text-sm text-muted-foreground">{t("imageChat.emptySubtitle")}</p>
                            </div>
                        )}
                    </div>
                </main>

                <footer className="shrink-0 border-t border-border bg-background px-3 py-3 md:px-6 md:py-4">
                    <div className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-2 shadow-sm">
                        {reference ? (
                            <div className="mb-2 flex items-center gap-3 rounded-md bg-muted/60 p-2">
                                <Image preview={false} src={reference.dataUrl} alt={reference.name} width={52} height={52} className="rounded object-cover" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{reference.name}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">{selectedSkillId ? t(`imageChat.skills.${selectedSkillId}`) : t("imageChat.referenceImage")}</div>
                                </div>
                                <Tooltip title={t("imageChat.removeReference")}>
                                    <Button type="text" size="small" icon={<X className="size-4" />} onClick={removeReference} aria-label={t("imageChat.removeReference")} />
                                </Tooltip>
                            </div>
                        ) : null}
                        <Input.TextArea
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key !== "Enter" || event.shiftKey) return;
                                event.preventDefault();
                                void generate();
                            }}
                            autoSize={{ minRows: 1, maxRows: 5 }}
                            variant="borderless"
                            placeholder={selectedSkillId ? t("imageChat.skillPlaceholder") : t("imageChat.placeholder")}
                            className="!resize-none !px-2 !py-2 !text-[15px]"
                        />
                        <div className="mt-1 flex items-end justify-between gap-2">
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                                <Tooltip title={reference ? t("imageChat.replaceReference") : t("imageChat.uploadReference")}>
                                    <Button
                                        type="text"
                                        size="small"
                                        loading={uploadingReference}
                                        disabled={Boolean(runningMessageId)}
                                        icon={<ImagePlus className="size-4" />}
                                        onClick={() => {
                                            if (!selectedSkillId) setSelectedSkillId("scenes-gathered-zine");
                                            fileInputRef.current?.click();
                                        }}
                                        aria-label={t("imageChat.uploadReference")}
                                    />
                                </Tooltip>
                                <Select
                                    size="small"
                                    value={selectedSkillId || "none"}
                                    disabled={Boolean(runningMessageId)}
                                    onChange={(value) => {
                                        const nextSkillId = value === "none" ? "" : (value as ImageChatSkillId);
                                        setSelectedSkillId(nextSkillId);
                                        if (!nextSkillId) removeReference();
                                    }}
                                    suffixIcon={<BookOpenText className="size-3.5" />}
                                    className="w-[168px]"
                                    popupMatchSelectWidth={220}
                                    options={[
                                        { value: "none", label: t("imageChat.skills.none") },
                                        ...IMAGE_CHAT_SKILL_IDS.map((value) => ({ value, label: t(`imageChat.skills.${value}`) })),
                                    ]}
                                    aria-label={t("imageChat.skill")}
                                />
                                <ModelPicker
                                    config={config}
                                    value={model}
                                    capability="image"
                                    onChange={(value) => updateConfig("imageModel", value)}
                                    onMissingConfig={() => openConfigDialog(true)}
                                    className="h-8 max-w-[200px] rounded-md border-0 px-2 shadow-none"
                                />
                                <Tooltip title={t("imageChat.polishDescription", { model: modelOptionLabel(config, textModel) })}>
                                    <Button type="text" size="small" loading={polishing} disabled={!prompt.trim() || Boolean(runningMessageId)} icon={<WandSparkles className="size-4" />} onClick={() => void polishAndGenerate()} aria-label={t("imageChat.polishAndGenerate")}>
                                        <span className="hidden sm:inline">{t("imageChat.polishAndGenerate")}</span>
                                    </Button>
                                </Tooltip>
                            </div>
                            {runningMessageId ? (
                                <Tooltip title={t("imageChat.stop")}>
                                    <Button shape="circle" type="primary" icon={<Square className="size-3.5 fill-current" />} onClick={() => abortRef.current?.abort()} aria-label={t("imageChat.stop")} />
                                </Tooltip>
                            ) : (
                                <Tooltip title={t("imageChat.send")}>
                                    <Button shape="circle" type="primary" disabled={!canSubmit || polishing || uploadingReference} icon={<ArrowUp className="size-4" />} onClick={() => void generate()} aria-label={t("imageChat.send")} />
                                </Tooltip>
                            )}
                        </div>
                    </div>
                </footer>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void addReference(event.target.files);
                        event.target.value = "";
                    }}
                />
            </section>
        </div>
    );
}

function ConversationSidebar({ sessions, activeSessionId, locale, onCreate, onSelect, onDelete }: { sessions: ImageChatSession[]; activeSessionId: string; locale: string; onCreate: () => void; onSelect: (id: string) => void; onDelete: (session: ImageChatSession) => void }) {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query.trim().toLowerCase());
    const visibleSessions = useMemo(() => sessions.filter((session) => !deferredQuery || session.title.toLowerCase().includes(deferredQuery) || session.messages.some((item) => item.content.toLowerCase().includes(deferredQuery))), [deferredQuery, sessions]);

    return (
        <div className="flex h-full min-h-0 w-full flex-col p-3">
            <Button block icon={<MessageSquarePlus className="size-4" />} onClick={onCreate} className="!h-10 !justify-start">
                {t("imageChat.newChat")}
            </Button>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Search className="size-4 text-muted-foreground" />} placeholder={t("imageChat.search")} allowClear className="mt-3" />
            <div className="mt-5 px-2 text-xs font-medium text-muted-foreground">{t("imageChat.recent")}</div>
            <div className="thin-scrollbar mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
                {visibleSessions.map((session) => (
                    <div key={session.id} className={cn("group flex items-center rounded-md", session.id === activeSessionId ? "bg-foreground/10" : "hover:bg-foreground/5")}>
                        <button type="button" className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => onSelect(session.id)}>
                            <div className="truncate text-sm font-medium">{session.title || t("imageChat.untitled")}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">{formatChatTime(session.updatedAt, locale)}</div>
                        </button>
                        <Dropdown
                            trigger={["click"]}
                            menu={{ items: [{ key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("common.delete") }], onClick: () => onDelete(session) }}
                        >
                            <Button type="text" size="small" className="mr-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100" icon={<Ellipsis className="size-4" />} aria-label={t("common.details")} />
                        </Dropdown>
                    </div>
                ))}
                {!visibleSessions.length ? <div className="px-2 py-8 text-center text-sm text-muted-foreground">{t("imageChat.noHistory")}</div> : null}
            </div>
        </div>
    );
}

function UserMessage({ content, references = [], skillLabel, onCopy }: { content: string; references?: ReferenceImage[]; skillLabel: string; onCopy: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="group flex justify-end">
            <div className="max-w-[85%] sm:max-w-[72%]">
                <div className="overflow-hidden rounded-lg bg-muted">
                    {references[0] ? <Image preview={false} src={references[0].dataUrl} alt={references[0].name} className="block max-h-72 w-full object-cover" /> : null}
                    <div className="px-4 py-3">
                        {skillLabel ? <div className="mb-1 text-xs font-medium text-muted-foreground">{skillLabel}</div> : null}
                        <div className="whitespace-pre-wrap text-[15px] leading-6">{content}</div>
                    </div>
                </div>
                <div className="mt-1 flex justify-end opacity-0 transition group-hover:opacity-100">
                    <Tooltip title={t("common.copy")}>
                        <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={onCopy} aria-label={t("common.copy")} />
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

function AssistantMessage({ item, modelLabel, prompt, onDownload, onRetry }: { item: ImageChatMessage; modelLabel: string; prompt: string; onDownload: () => void; onRetry: () => void }) {
    const { t } = useTranslation();
    if (item.status === "pending") {
        return (
            <div className="max-w-xl">
                <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                        <LoaderCircle className="size-4 animate-spin" />
                        {t("imageChat.generating")}
                    </span>
                    <GenerationElapsed startedAt={item.createdAt} />
                </div>
                <div className="aspect-square w-full max-w-[520px] overflow-hidden rounded-lg border border-border">
                    <ImageGenerationPlaceholder />
                </div>
            </div>
        );
    }
    if (item.status === "error" || !item.image) {
        return (
            <div className="max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
                <div className="font-medium">{t("imageChat.generationFailed")}</div>
                <div className="mt-1 break-words text-xs opacity-80">{item.error || t("imageChat.interrupted")}</div>
                <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs opacity-70">{item.durationMs === undefined ? null : t("imageChat.duration", { time: formatDuration(item.durationMs) })}</span>
                    <Button type="text" size="small" danger icon={<RefreshCw className="size-4" />} onClick={onRetry}>
                        {t("imageChat.retry")}
                    </Button>
                </div>
            </div>
        );
    }
    return (
        <div className="max-w-xl">
            <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                    <Check className="size-4" />
                    {t("imageChat.generated")}
                </span>
                <span className="truncate text-xs text-muted-foreground">{[modelLabel, item.durationMs === undefined ? "" : t("imageChat.duration", { time: formatDuration(item.durationMs) })].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                <Image width="100%" src={item.image.url} alt={prompt} className="block max-h-[620px] w-full object-contain" />
            </div>
            <div className="mt-2 flex items-center gap-1">
                <Tooltip title={t("common.download")}>
                    <Button type="text" icon={<Download className="size-4" />} onClick={onDownload} aria-label={t("common.download")} />
                </Tooltip>
            </div>
        </div>
    );
}

function GenerationElapsed({ startedAt }: { startedAt: number }) {
    const { t } = useTranslation();
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    return <span className="text-xs text-muted-foreground">{t("imageChat.elapsed", { time: formatDuration(now - startedAt) })}</span>;
}

function findPreviousPrompt(messages: ImageChatMessage[], index: number) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (messages[cursor].role === "user") return messages[cursor].content;
    }
    return "";
}

function formatChatTime(value: number, locale: string) {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}
