"use client";

import localforage from "localforage";
import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { UploadedImage } from "@/services/image-storage";

const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

export async function saveImageGenerationLog({
    prompt,
    model,
    config,
    references,
    durationMs,
    requestedCount,
    images,
}: {
    prompt: string;
    model: string;
    config: Pick<AiConfig, "quality" | "size">;
    references: ReferenceImage[];
    durationMs: number;
    requestedCount: number;
    images: Array<{ image: UploadedImage; durationMs: number }>;
}) {
    const id = nanoid();
    const createdAt = Date.now();
    const storedImages = images.map(({ image, durationMs: imageDurationMs }) => ({
        id: nanoid(),
        dataUrl: "",
        storageKey: image.storageKey,
        durationMs: imageDurationMs,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
        mimeType: image.mimeType,
    }));
    await logStore.setItem(id, {
        id,
        createdAt,
        title: prompt.slice(0, 12) || "未命名",
        prompt,
        time: new Date(createdAt).toLocaleString("zh-CN", { hour12: false }),
        model,
        config: { model, imageModel: model, quality: config.quality, size: config.size, count: String(requestedCount) },
        references: references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        durationMs,
        successCount: storedImages.length,
        failCount: requestedCount - storedImages.length,
        imageCount: requestedCount,
        size: config.size,
        quality: config.quality,
        status: storedImages.length ? "成功" : "失败",
        images: storedImages,
        thumbnails: [],
    });
}
