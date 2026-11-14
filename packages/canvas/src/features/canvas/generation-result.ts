import { fitNodeSize } from "../../lib/canvas/canvas-node-size";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeImage, type CanvasNodeMetadata } from "../../types/canvas";
import type { CanvasImportedImage } from "./contracts";
import { canvasAssetMetadata } from "./asset-metadata";
import type { CanvasGenerationConfig } from "./generation-preferences";
import type { ReferenceImage } from "../../types/image";

export type CanvasRetryImageResult = {
    nodeId: string;
    imageId?: string;
    retryImage: CanvasNodeImage;
    uploadedImage: CanvasImportedImage;
    defaultImageSize: { width: number; height: number };
    prompt: string;
    generationMetadata: Partial<CanvasNodeMetadata>;
};

export function resolveCanvasRetryImageMetadata(
    savedMetadata: CanvasNodeMetadata | undefined,
    config: Pick<CanvasGenerationConfig, "model" | "size" | "quality" | "background">,
    useReferenceImages: boolean,
    retryImages: ReferenceImage[],
): Partial<CanvasNodeMetadata> {
    return savedMetadata?.generationType
        ? {
              generationType: savedMetadata.generationType,
              model: config.model,
              size: config.size,
              quality: config.quality,
              ...(config.background ? { background: config.background } : {}),
              count: savedMetadata.count || 1,
              references: savedMetadata.references,
          }
        : {
              generationType: useReferenceImages ? "edit" : "generation",
              model: config.model,
              size: config.size,
              quality: config.quality,
              ...(config.background ? { background: config.background } : {}),
              count: 1,
              references: retryImages.map((reference) => reference.storageKey || reference.url || (!reference.dataUrl.startsWith("data:") ? reference.dataUrl : undefined)).filter((url): url is string => Boolean(url)),
          };
}

export function applyCanvasRetryImageResult(nodes: CanvasNodeData[], result: CanvasRetryImageResult): CanvasNodeData[] {
    return nodes.map((node) => {
        if (node.id !== result.nodeId) return node;
        const makePrimary = !result.imageId || node.metadata?.primaryImageId === result.retryImage.id || !node.metadata?.content;
        const edge = result.imageId ? Math.max(node.width, node.height) : 0;
        const size = result.imageId
            ? node.metadata?.freeResize
                ? { width: node.width, height: node.height }
                : fitNodeSize(result.uploadedImage.width, result.uploadedImage.height, edge, edge)
            : fitNodeSize(result.uploadedImage.width, result.uploadedImage.height, result.defaultImageSize.width, result.defaultImageSize.height);

        return {
            ...node,
            type: CanvasNodeType.Image,
            ...(makePrimary
                ? {
                      width: size.width,
                      height: size.height,
                      ...(result.imageId ? { position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } } : {}),
                  }
                : {}),
            metadata: {
                ...node.metadata,
                ...(makePrimary ? canvasAssetMetadata(result.uploadedImage) : { status: "success" as const }),
                images: node.metadata?.images?.map((image) => (image.id === result.retryImage.id ? result.retryImage : image)),
                primaryImageId: makePrimary ? result.retryImage.id : node.metadata?.primaryImageId,
                prompt: result.prompt,
                ...result.generationMetadata,
            },
        };
    });
}
