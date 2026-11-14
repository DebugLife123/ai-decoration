import type { CanvasNodeData } from "../../types/canvas";

export type CanvasImageEditFailure = { nodeId: string; errorDetails: string };

export function applyCanvasImageEditFailure(nodes: CanvasNodeData[], failure: CanvasImageEditFailure): CanvasNodeData[] {
    return nodes.map((node) => node.id === failure.nodeId
        ? { ...node, metadata: { ...node.metadata, status: "error" as const, errorDetails: failure.errorDetails } }
        : node);
}
