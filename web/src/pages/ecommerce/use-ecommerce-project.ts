import localforage from "localforage";
import { useEffect, useRef, useState } from "react";

import i18n from "@/i18n";
import { resolveImageUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

export type CommerceImage = {
    url: string;
    storageKey?: string;
    assetId?: string;
    localizationStatus?: "pending" | "success" | "error";
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

export type CommerceSection = {
    id: string;
    title: string;
    prompt: string;
    status: "pending" | "success" | "error" | "canceled";
    image?: CommerceImage;
    sourceImage?: CommerceImage;
    versions: CommerceImage[];
    activeVersionIndex: number;
    overlayTitle: string;
    overlayBody: string;
    durationMs?: number;
    error?: string;
};

export type EcommerceProject = {
    reference: ReferenceImage | null;
    productInfo: string;
    sectionCount: number;
    ratio: string;
    sections: CommerceSection[];
    longImage: CommerceImage | null;
    overlayEnabled: boolean;
    exportPreset: string;
    sliceHeight: number;
};

type StoredEcommerceProject = EcommerceProject & { version: 1 };

const PROJECT_KEY = "current-project";
const projectStore = localforage.createInstance({ name: "infinite-canvas", storeName: "ecommerce_project" });
let projectWriteQueue = Promise.resolve();

function serializeImage(image?: CommerceImage | null) {
    return image ? { ...image, url: image.storageKey ? "" : image.url } : image;
}

function serializeProject(project: EcommerceProject): StoredEcommerceProject {
    return {
        ...project,
        version: 1,
        reference: project.reference ? { ...project.reference, dataUrl: project.reference.storageKey ? "" : project.reference.dataUrl } : null,
        longImage: serializeImage(project.longImage) || null,
        sections: project.sections.map((section) => ({
            ...section,
            image: serializeImage(section.image),
            sourceImage: serializeImage(section.sourceImage),
            versions: section.versions.map((image) => serializeImage(image)!),
        })),
    };
}

async function hydrateImage(image?: CommerceImage | null) {
    if (!image) return image;
    return {
        ...image,
        url: await resolveImageUrl(image.storageKey, image.url),
        localizationStatus: image.storageKey ? ("success" as const) : image.localizationStatus === "pending" ? ("error" as const) : image.localizationStatus,
    };
}

async function hydrateProject(project: StoredEcommerceProject): Promise<EcommerceProject> {
    const sections = await Promise.all(
        project.sections.map(async (section) => {
            const versions = await Promise.all(section.versions.map((image) => hydrateImage(image) as Promise<CommerceImage>));
            const activeVersionIndex = Math.min(Math.max(0, section.activeVersionIndex), Math.max(0, versions.length - 1));
            const image = versions[activeVersionIndex] || (await hydrateImage(section.image)) || undefined;
            return {
                ...section,
                status: section.status === "pending" ? ("canceled" as const) : section.status,
                error: section.status === "pending" ? i18n.t("imageChat.interrupted") : section.error,
                image,
                sourceImage: (await hydrateImage(section.sourceImage)) || undefined,
                versions,
                activeVersionIndex,
            };
        }),
    );
    const reference = project.reference
        ? { ...project.reference, dataUrl: await resolveImageUrl(project.reference.storageKey, project.reference.dataUrl) }
        : null;
    return { ...project, reference, sections, longImage: (await hydrateImage(project.longImage)) || null };
}

export function useEcommerceProjectPersistence(project: EcommerceProject, onRestore: (project: EcommerceProject) => void) {
    const restoreRef = useRef(onRestore);
    const [hydrated, setHydrated] = useState(false);
    restoreRef.current = onRestore;

    useEffect(() => {
        let canceled = false;
        void projectStore
            .getItem<StoredEcommerceProject>(PROJECT_KEY)
            .then(async (stored) => {
                if (stored?.version !== 1) return;
                const project = await hydrateProject(stored);
                if (!canceled) restoreRef.current(project);
            })
            .catch(() => {})
            .finally(() => {
                if (!canceled) setHydrated(true);
            });
        return () => {
            canceled = true;
        };
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        const timer = window.setTimeout(() => {
            const snapshot = serializeProject(project);
            projectWriteQueue = projectWriteQueue.then(() => projectStore.setItem(PROJECT_KEY, snapshot)).catch(() => {});
        }, 150);
        return () => window.clearTimeout(timer);
    }, [hydrated, project]);

    return hydrated;
}
