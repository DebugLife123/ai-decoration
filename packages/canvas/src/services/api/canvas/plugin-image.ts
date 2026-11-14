import { readCanvasReferenceImages, type CanvasMediaAdapter } from "../../../features/canvas/media";
import type { CanvasPluginImageGeneration } from "../../../features/canvas/image-generation";
import type { CanvasGenerationConfig } from "../../../features/canvas/generation-preferences";
import type { GenerateImageResult } from "../../../types/canvas-plugin";
import type { ReferenceImage } from "../../../types/image";

export async function generateCanvasPluginImage(media: CanvasMediaAdapter, projectId: string, config: CanvasGenerationConfig, prompt: string, references: ReferenceImage[], signal: AbortSignal, generation: CanvasPluginImageGeneration): Promise<GenerateImageResult> {
    signal.throwIfAborted();
    const result = await generation.execute({
        projectId,
        operation: references.length ? "edit" : "generate",
        prompt,
        settings: { model: config.model, quality: config.quality, size: config.size, background: config.background, count: Math.max(1, Math.floor(Math.abs(Number(config.count)) || 1)) },
        references: references.map(({ id, name, type, dataUrl }) => ({ id, name, type, dataUrl })),
    }, signal);
    const items = result.dataUrls.map((dataUrl, index) => ({ id: `plugin-result-${index}`, dataUrl }));
    signal.throwIfAborted();
    const images = await Promise.all(items.map(async (item) => {
        try {
            // Provider result identity is not a persisted project assetId; MIME is unknown here.
            const [image] = await readCanvasReferenceImages(media, projectId, [{ ...item, name: item.id, type: "" }], signal);
            signal.throwIfAborted();
            return image.dataUrl;
        } catch (error) {
            signal.throwIfAborted();
            if (error instanceof Error && error.name === "AbortError") throw error;
            return item.dataUrl;
        }
    }));
    signal.throwIfAborted();
    return { images };
}
