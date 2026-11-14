import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";

export function applyCanvasGenerationStart(nodes: CanvasNodeData[], { nodeId, prompt, imageId }: { nodeId: string; prompt?: string; imageId?: string }): CanvasNodeData[] {
    return nodes.map((node) => node.id !== nodeId ? node : {
        ...node,
        metadata: {
            ...node.metadata,
            ...(prompt !== undefined && node.type !== CanvasNodeType.Config ? { prompt } : {}),
            status: "loading" as const,
            errorDetails: undefined,
            errorCode: undefined,
            ...(imageId !== undefined ? { images: node.metadata?.images?.map((image) => image.id === imageId ? { ...image, status: "loading" as const, errorDetails: undefined } : image) } : {}),
        },
    });
}
