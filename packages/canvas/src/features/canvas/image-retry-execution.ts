import { nanoid } from "nanoid";
import type { CanvasNodeData, CanvasNodeImage, CanvasNodeMetadata } from "../../types/canvas";
import { generateCanvasImage, type CanvasImageGeneration } from "./image-generation";
import type { CanvasGenerationConfig } from "./generation-preferences";
import type { CanvasImportedImage } from "./contracts";
import type { ReferenceImage } from "../../types/image";
import { resolveCanvasRetryImageMetadata, type CanvasRetryImageResult } from "./generation-result";

export async function executeCanvasImageRetry({
    projectId,
    generation,
    saveResultImage,
    node,
    savedMetadata,
    imageId,
    prompt,
    settings,
    useReferenceImages,
    references,
    signal,
    defaultImageSize,
}: {
    projectId: string;
    generation: CanvasImageGeneration | undefined;
    saveResultImage: (source: string | Blob, name: string, signal: AbortSignal) => Promise<CanvasImportedImage>;
    node: CanvasNodeData;
    savedMetadata?: CanvasNodeMetadata;
    imageId?: string;
    prompt: string;
    settings: CanvasGenerationConfig;
    useReferenceImages: boolean;
    references: ReferenceImage[];
    signal: AbortSignal;
    defaultImageSize: { width: number; height: number };
}): Promise<CanvasRetryImageResult> {
    const image = await generateCanvasImage(generation, {
        projectId,
        operation: useReferenceImages ? "edit" : "generate",
        prompt,
        settings,
        references,
    }, signal);
    const uploadedImage = await saveResultImage(image.dataUrl, `canvas-${imageId || node.id}.png`, signal);
    const retryImage: CanvasNodeImage = {
        id: imageId || node.metadata?.primaryImageId || nanoid(),
        assetId: uploadedImage.assetId,
        status: "success",
        content: uploadedImage.url,
        storageKey: uploadedImage.storageKey,
        naturalWidth: uploadedImage.width,
        naturalHeight: uploadedImage.height,
        bytes: uploadedImage.bytes,
        mimeType: uploadedImage.mimeType,
    };
    return {
        nodeId: node.id,
        imageId,
        retryImage,
        uploadedImage,
        defaultImageSize,
        prompt,
        generationMetadata: resolveCanvasRetryImageMetadata(savedMetadata, settings, useReferenceImages, references),
    };
}
