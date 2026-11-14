import type { CanvasNodeData, SelectionBox } from "../../types/canvas";

export function getCanvasNodeBounds(nodes: CanvasNodeData[]) {
    return nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
}

export function selectCanvasNodesInBox(nodes: CanvasNodeData[], selection: SelectionBox): Set<string> {
    const left = Math.min(selection.startWorldX, selection.currentWorldX);
    const top = Math.min(selection.startWorldY, selection.currentWorldY);
    const right = Math.max(selection.startWorldX, selection.currentWorldX);
    const bottom = Math.max(selection.startWorldY, selection.currentWorldY);
    const selected = new Set(selection.additive ? selection.initialSelectedNodeIds : []);
    nodes.forEach((node) => {
        const intersects = left < node.position.x + node.width && right > node.position.x && top < node.position.y + node.height && bottom > node.position.y;
        if (intersects) selected.add(node.id);
    });
    return selected;
}

export function getCanvasSelectionBoxBounds(selection: SelectionBox) {
    return {
        left: Math.min(selection.startWorldX, selection.currentWorldX),
        top: Math.min(selection.startWorldY, selection.currentWorldY),
        width: Math.abs(selection.currentWorldX - selection.startWorldX),
        height: Math.abs(selection.currentWorldY - selection.startWorldY),
    };
}
