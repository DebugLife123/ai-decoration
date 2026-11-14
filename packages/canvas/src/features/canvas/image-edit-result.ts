import { fitNodeSize } from "../../lib/canvas/canvas-node-size";
import type { CanvasNodeData, CanvasNodeMetadata } from "../../types/canvas";
import type { CanvasImportedImage } from "./contracts";
import { canvasAssetMetadata } from "./asset-metadata";

export type CanvasImageEditResult = {
    nodeId: string;
    uploadedImage: CanvasImportedImage;
    defaultImageSize: { width: number; height: number };
    prompt: string;
    generationMetadata: Partial<CanvasNodeMetadata>;
};

export function applyCanvasImageEditResult(nodes: CanvasNodeData[], result: CanvasImageEditResult): CanvasNodeData[] {
    return nodes.map((node) => {
        if (node.id !== result.nodeId) return node;
        const size = fitNodeSize(result.uploadedImage.width, result.uploadedImage.height, result.defaultImageSize.width, result.defaultImageSize.height);
        return {
            ...node,
            width: size.width,
            height: size.height,
            metadata: {
                ...node.metadata,
                ...canvasAssetMetadata(result.uploadedImage),
                prompt: result.prompt,
                ...result.generationMetadata,
            },
        };
    });
}
