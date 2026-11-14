import type { Position } from "../../types/canvas";
import type { CanvasConnectionDropTarget } from "./viewport-geometry";

export type CanvasConnectionDropAction =
    | { type: "connect"; nodeId: string }
    | { type: "cancel" }
    | { type: "create"; position: Position };

export function resolveCanvasConnectionHover(dropTarget: CanvasConnectionDropTarget, worldPosition: Position) {
    return { targetNodeId: dropTarget.nodeId, mouseWorld: worldPosition };
}

export function resolveCanvasConnectionDrop(dropTarget: CanvasConnectionDropTarget, position: Position): CanvasConnectionDropAction {
    if (dropTarget.nodeId) return { type: "connect", nodeId: dropTarget.nodeId };
    if (dropTarget.isNearNode) return { type: "cancel" };
    return { type: "create", position };
}
