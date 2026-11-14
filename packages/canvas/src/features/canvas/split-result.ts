import type { CanvasNodeData } from "../../types/canvas";
import type { CanvasSplitBatch } from "./split-image";

export function resolveCanvasSplitWriteback(previous: CanvasSplitBatch, result: CanvasSplitBatch): { newNodes: CanvasNodeData[]; complete: boolean } {
    const savedIds = new Set(previous.items.flatMap((item) => item.node ? [item.node.id] : []));
    return {
        newNodes: result.items.flatMap((item) => item.node && !savedIds.has(item.node.id) ? [item.node] : []),
        complete: result.items.every((item) => Boolean(item.node)),
    };
}
