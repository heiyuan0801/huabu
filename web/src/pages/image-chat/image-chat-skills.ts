// Adapted from gathered-scenes-zine-skill (MIT, Copyright (c) 2026 Zeejay0).
// https://github.com/Zeejay0/gathered-scenes-zine-skill
export const IMAGE_CHAT_SKILL_IDS = ["scenes-gathered-zine", "scene-distillation-zine"] as const;

export type ImageChatSkillId = (typeof IMAGE_CHAT_SKILL_IDS)[number];

export const IMAGE_CHAT_SKILL_SIZE = "3:5";

export function buildImageChatSkillPrompt(skillId: ImageChatSkillId, direction = "") {
    const userDirection = direction.trim() ? `\nUser direction: ${direction.trim()}` : "";
    if (skillId === "scene-distillation-zine") {
        return `Create one vertical 3:5 editorial art zine distilled from the reference photograph. Analyze its subjects, spatial relationships, visual weight, native colors, emotional residue and most important tension, then reinterpret only 2-4 essential anchors as original flat illustration. Do not reproduce, embed, crop, collage, trace or retain any photographic pixels from the reference. The final image must contain original illustration, tactile off-white paper and restrained typography-like marks only, with no photorealistic region. Use 68-85% quiet negative space, one dominant graphic mass, 1-3 small supporting marks, one restrained texture field and only one small high-chroma accent color. Favor imperfect ink, pencil, crayon, torn-paper edges, screen-print grain and scanned-paper texture. Keep the composition open to interpretation, emotionally specific and visually sparse. Avoid glossy 3D rendering, decorative clutter, literal captions, legible brand names, watermarks, fake UI and generic scrapbook templates.${userDirection}`;
    }
    return `Create one vertical 3:5 gathered-scenes editorial zine using the reference photograph as the truthful photographic anchor. Preserve the recognizable subject, scene identity, key spatial relationships, native color cues and believable photographic texture; do not repaint or beautify the photo into synthetic AI imagery. Integrate the photograph with one dominant abstract paper-illustration field and 1-2 supporting marks through an intentional torn-paper boundary with visible fiber texture. Let photography occupy roughly 25-60% of the canvas and keep most of the illustration field quiet; active graphic marks should occupy only 15-35% of the whole composition. Use tactile off-white stock, scanned grain, imperfect ink, pencil, crayon or screen-print textures, plus only one restrained high-chroma accent color. The result should feel like a carefully art-directed independent magazine page, not a template collage. Avoid glossy 3D rendering, excessive stickers, random decoration, large readable text, invented logos, watermarks, fake UI and changes to the subject's identity.${userDirection}`;
}
