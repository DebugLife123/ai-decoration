import type { CanvasNodeData } from "../../types/canvas";
import type { ReferenceImage } from "../../types/image";

export function createCanvasImageReference(node: CanvasNodeData, name = `${node.title || node.id}.png`): ReferenceImage | null {
    const dataUrl = node.metadata?.content;
    if (!dataUrl) return null;
    return {
        id: node.id,
        assetId: node.metadata?.assetId,
        name,
        type: node.metadata?.mimeType || "image/png",
        dataUrl,
        storageKey: node.metadata?.storageKey,
    };
}
