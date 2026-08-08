import { ECOMMERCE_SCENE_ROLES, ECOMMERCE_SCENE_TEMPLATES, type EcommerceSceneRole, type EcommerceSceneTemplateId } from "@/lib/ecommerce-templates";

export type DetailPlanSection = {
    title: string;
    prompt: string;
    role: EcommerceSceneRole;
    templateId: EcommerceSceneTemplateId;
    variantId: string;
    headline: string;
    body: string;
};

export type DetailImageOverlay = {
    enabled: boolean;
    title: string;
    body: string;
};

export function parseDetailPlan(value: string, count: number): DetailPlanSection[] | null {
    const start = value.indexOf("[");
    const end = value.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    try {
        const parsed = JSON.parse(value.slice(start, end + 1));
        if (!Array.isArray(parsed)) return null;
        const sections = parsed
            .map((item) => ({
                title: typeof item?.title === "string" ? item.title.trim() : "",
                prompt: typeof item?.prompt === "string" ? item.prompt.trim() : "",
                role: ECOMMERCE_SCENE_ROLES.includes(item?.role) ? (item.role as EcommerceSceneRole) : "feature",
                templateId: ECOMMERCE_SCENE_TEMPLATES.some((template) => template.id === item?.templateId) ? (item.templateId as EcommerceSceneTemplateId) : "hero-image",
                variantId: typeof item?.variantId === "string" ? item.variantId.trim() : "",
                headline: typeof item?.headline === "string" ? item.headline.trim() : "",
                body: typeof item?.body === "string" ? item.body.trim() : "",
            }))
            .filter((item) => item.title && item.prompt)
            .slice(0, count);
        return sections.length === count ? sections : null;
    } catch {
        return null;
    }
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>, signal?: AbortSignal) {
    const results = new Array<R | undefined>(items.length);
    let cursor = 0;
    await Promise.all(
        Array.from({ length: Math.min(Math.max(1, Math.floor(concurrency) || 1), items.length) }, async () => {
            while (cursor < items.length) {
                if (signal?.aborted) break;
                const index = cursor;
                cursor += 1;
                results[index] = await worker(items[index], index);
            }
        }),
    );
    return results;
}

export async function stitchVerticalImages(sources: string[], width = 1080, overlays: DetailImageOverlay[] = []) {
    const images = await Promise.all(sources.map(loadImage));
    const heights = images.map((image) => Math.round((width * image.naturalHeight) / image.naturalWidth));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = heights.reduce((sum, height) => sum + height, 0);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    let top = 0;
    images.forEach((image, index) => {
        context.drawImage(image, 0, top, width, heights[index]);
        drawOverlay(context, overlays[index], width, top, heights[index]);
        top += heights[index];
    });
    return canvasToBlob(canvas);
}

export async function sliceVerticalImage(source: string, maxHeight: number) {
    const image = await loadImage(source);
    const sliceHeight = Math.max(200, Math.round(maxHeight));
    const slices: Blob[] = [];
    for (let top = 0; top < image.naturalHeight; top += sliceHeight) {
        const height = Math.min(sliceHeight, image.naturalHeight - top);
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, top, image.naturalWidth, height, 0, 0, image.naturalWidth, height);
        slices.push(await canvasToBlob(canvas));
    }
    return slices;
}

function drawOverlay(context: CanvasRenderingContext2D, overlay: DetailImageOverlay | undefined, width: number, top: number, height: number) {
    if (!overlay?.enabled || (!overlay.title.trim() && !overlay.body.trim())) return;
    const padding = Math.round(width * 0.055);
    const titleSize = Math.max(24, Math.round(width * 0.044));
    const bodySize = Math.max(18, Math.round(width * 0.027));
    const titleLines = wrapText(context, overlay.title.trim(), width - padding * 2, `600 ${titleSize}px system-ui, sans-serif`);
    const bodyLines = wrapText(context, overlay.body.trim(), width - padding * 2, `400 ${bodySize}px system-ui, sans-serif`);
    const titleLineHeight = Math.round(titleSize * 1.3);
    const bodyLineHeight = Math.round(bodySize * 1.55);
    const contentHeight = titleLines.length * titleLineHeight + bodyLines.length * bodyLineHeight + (titleLines.length && bodyLines.length ? Math.round(bodySize * 0.5) : 0);
    const panelHeight = Math.min(height, contentHeight + padding * 2);
    const panelTop = top + height - panelHeight;
    context.fillStyle = "rgba(12, 12, 12, 0.72)";
    context.fillRect(0, panelTop, width, panelHeight);
    context.fillStyle = "#fff";
    let y = panelTop + padding;
    context.font = `600 ${titleSize}px system-ui, sans-serif`;
    titleLines.forEach((line) => {
        y += titleLineHeight;
        context.fillText(line, padding, y);
    });
    if (titleLines.length && bodyLines.length) y += Math.round(bodySize * 0.5);
    context.font = `400 ${bodySize}px system-ui, sans-serif`;
    context.fillStyle = "rgba(255, 255, 255, 0.88)";
    bodyLines.forEach((line) => {
        y += bodyLineHeight;
        context.fillText(line, padding, y);
    });
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number, font: string) {
    if (!value) return [];
    context.font = font;
    const lines: string[] = [];
    value.split("\n").forEach((paragraph) => {
        let line = "";
        Array.from(paragraph).forEach((character) => {
            const candidate = line + character;
            if (line && context.measureText(candidate).width > maxWidth) {
                lines.push(line);
                line = character;
            } else line = candidate;
        });
        if (line) lines.push(line);
    });
    return lines;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
        try {
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image composition failed"))), "image/jpeg", 0.92);
        } catch (error) {
            reject(error);
        }
    });
}

function loadImage(source: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const timer = window.setTimeout(() => {
            image.onload = null;
            image.onerror = null;
            image.src = "";
            reject(new Error("Image load timed out"));
        }, 30000);
        image.crossOrigin = "anonymous";
        image.onload = () => {
            window.clearTimeout(timer);
            resolve(image);
        };
        image.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error("Image could not be loaded"));
        };
        image.src = source;
    });
}
