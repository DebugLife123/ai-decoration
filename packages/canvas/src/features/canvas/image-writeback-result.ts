import type { CanvasNodeData } from "../../types/canvas";
import type { CanvasImportedImage } from "./contracts";
import { canvasAssetMetadata } from "./asset-metadata";

export function applyCanvasImageWritebackResult(
    nodes: CanvasNodeData[],
    result: { nodeId: string; uploadedImage: CanvasImportedImage; prompt: string; model: string },
): CanvasNodeData[] {
    return nodes.map((node) => node.id !== result.nodeId ? node : {
        ...node,
        metadata: {
            ...node.metadata,
            ...canvasAssetMetadata(result.uploadedImage),
            prompt: result.prompt,
            model: result.model,
            status: "success",
            errorDetails: undefined,
        },
    });
}
