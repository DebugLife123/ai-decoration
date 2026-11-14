import { readCanvasReferenceImages, type CanvasMediaAdapter } from "../../../features/canvas/media";
import type { AiConfig } from "../../../stores/use-config-store";
import type { ReferenceImage } from "../../../types/image";
import { requestEdit } from "../image";

export async function requestCanvasImageEdit(media: CanvasMediaAdapter, projectId: string, config: AiConfig, prompt: string, references: ReferenceImage[], signal: AbortSignal) {
    const images = await readCanvasReferenceImages(media, projectId, references, signal);
    signal.throwIfAborted();
    const result = await requestEdit(config, prompt, images, { signal, readImage: async (image) => image.dataUrl });
    signal.throwIfAborted();
    return result;
}
