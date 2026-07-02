import { imageToDataUrl } from "@/services/image-storage";
import { modelOptionName, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

export type GrokVideoMode = "generate" | "edit" | "extend";

export function isGrokVideoConfig(config: AiConfig | Pick<AiConfig, "model" | "videoModel" | "baseUrl">) {
    const requestConfig = "channels" in config ? resolveModelRequestConfig(config, config.model || config.videoModel) : config;
    return isGrokVideoModel(modelOptionName(requestConfig.model || requestConfig.videoModel)) || isXaiBaseUrl(requestConfig.baseUrl);
}

export function isGrokVideoModel(model: string) {
    const value = model.toLowerCase();
    return value.includes("grok") && value.includes("video");
}

export function isXaiBaseUrl(baseUrl: string) {
    return /(^|\.)x\.ai$/i.test(safeHost(baseUrl));
}

export function isDefaultOpenAIBaseUrl(baseUrl: string) {
    return safeHost(baseUrl).toLowerCase() === "api.openai.com";
}

export function normalizeGrokDuration(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return Math.max(1, Math.min(20, seconds));
}

export function normalizeGrokVideoMode(value: string | undefined): GrokVideoMode {
    return value === "edit" || value === "extend" ? value : "generate";
}

export async function buildGrokImageReference(image?: ReferenceImage) {
    if (!image) return undefined;
    const directUrl = image.url || image.dataUrl;
    const url = isGrokImageUrl(directUrl) ? directUrl : await imageToDataUrl(image);
    if (!url) throw new Error("Grok 参考图读取失败，请换一张图片或重新上传");
    return { url };
}

function isGrokImageUrl(value: string) {
    return /^https?:\/\//i.test(value || "") || /^data:image\//i.test(value || "");
}

function safeHost(baseUrl: string) {
    try {
        return new URL(baseUrl).hostname;
    } catch {
        return "";
    }
}
