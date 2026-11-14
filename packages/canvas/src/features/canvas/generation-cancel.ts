import type { CanvasNodeData } from "../../types/canvas";

export function applyCanvasGenerationCancellation(nodes: CanvasNodeData[], affectedNodeIds: ReadonlySet<string>, message: string): CanvasNodeData[] {
    return nodes.map((node) => {
        if (!affectedNodeIds.has(node.id) || node.metadata?.status !== "loading") return node;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: "idle",
                errorDetails: undefined,
                images: node.metadata.images?.map((image) => (image.status === "loading" ? { ...image, status: "error" as const, errorDetails: message } : image)),
                texts: node.metadata.texts?.map((text) => (text.status === "loading" ? { ...text, status: "error" as const, errorDetails: message } : text)),
            },
        };
    });
}
