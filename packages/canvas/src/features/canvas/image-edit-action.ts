import type { CanvasNodeData } from "../../types/canvas";
import { applyCanvasImageEditFailure, type CanvasImageEditFailure } from "./image-edit-failure";
import { applyCanvasImageEditResult, type CanvasImageEditResult } from "./image-edit-result";

export type CanvasImageEditAction =
    | { kind: "succeeded"; result: CanvasImageEditResult }
    | { kind: "failed"; failure: CanvasImageEditFailure };

export function applyCanvasImageEditAction(nodes: CanvasNodeData[], action: CanvasImageEditAction): CanvasNodeData[] {
    return action.kind === "succeeded"
        ? applyCanvasImageEditResult(nodes, action.result)
        : applyCanvasImageEditFailure(nodes, action.failure);
}
