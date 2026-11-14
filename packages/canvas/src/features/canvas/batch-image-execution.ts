import type { CanvasNodeImage } from "../../types/canvas";
import { generateCanvasImage, type CanvasImageGeneration } from "./image-generation";
import type { CanvasImportedImage } from "./contracts";
import type { ReferenceImage } from "../../types/image";
import type { CanvasGenerationConfig } from "./generation-preferences";

export type CanvasBatchImageAttempt =
    | { status: "succeeded"; image: CanvasNodeImage }
    | { status: "failed"; errorDetails: string }
    | { status: "canceled" };

export async function executeCanvasBatchImageAttempt({
    projectId,
    generation,
    saveResultImage,
    imageId,
    prompt,
    settings,
    references,
    signal,
    isCanceled,
    fallbackMessage,
}: {
    projectId: string;
    generation: CanvasImageGeneration | undefined;
    saveResultImage: (source: string | Blob, name: string, signal: AbortSignal) => Promise<CanvasImportedImage>;
    imageId: string;
    prompt: string;
    settings: CanvasGenerationConfig;
    references: ReferenceImage[];
    signal: AbortSignal;
    isCanceled: (error: unknown) => boolean;
    fallbackMessage: string;
}): Promise<CanvasBatchImageAttempt> {
    try {
        const image = await generateCanvasImage(generation, {
            projectId,
            operation: references.length ? "edit" : "generate",
            prompt,
            settings,
            references,
        }, signal);
        const uploaded = await saveResultImage(image.dataUrl, `canvas-${imageId}.png`, signal);
        return {
            status: "succeeded",
            image: {
                id: imageId,
                assetId: uploaded.assetId,
                status: "success",
                content: uploaded.url,
                storageKey: uploaded.storageKey,
                naturalWidth: uploaded.width,
                naturalHeight: uploaded.height,
                bytes: uploaded.bytes,
                mimeType: uploaded.mimeType,
            },
        };
    } catch (error) {
        if (isCanceled(error)) return { status: "canceled" };
        return { status: "failed", errorDetails: error instanceof Error ? error.message : fallbackMessage };
    }
}
