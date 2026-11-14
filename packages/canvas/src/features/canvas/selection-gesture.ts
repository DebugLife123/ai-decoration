import { selectCanvasNodesInBox } from "./selection-geometry";
import type { CanvasNodeData, Position, SelectionBox } from "../../types/canvas";

export function createCanvasSelectionBox(point: Position, additive: boolean, selectedIds: ReadonlySet<string>): SelectionBox {
    return {
        startWorldX: point.x,
        startWorldY: point.y,
        currentWorldX: point.x,
        currentWorldY: point.y,
        additive,
        initialSelectedNodeIds: additive ? [...selectedIds] : [],
    };
}

export function updateCanvasSelectionBox(selection: SelectionBox, point: Position, buttons: number): SelectionBox | null {
    if (buttons === 0) return null;
    return { ...selection, currentWorldX: point.x, currentWorldY: point.y };
}

export function resolveCanvasSelectionMove(nodes: CanvasNodeData[], selection: SelectionBox, point: Position, buttons: number) {
    const nextSelection = updateCanvasSelectionBox(selection, point, buttons);
    return nextSelection ? { selection: nextSelection, selectedIds: selectCanvasNodesInBox(nodes, nextSelection) } : null;
}
