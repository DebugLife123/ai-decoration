import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";
import { findContainingGroupId, findGroupDropTarget, snapNodesIntoGroup } from "./group-actions";

export type CanvasNodeDragPosition = { id: string; x: number; y: number };
export type CanvasNodeDragState = {
    isDraggingNode: boolean;
    hasMoved: boolean;
    startX: number;
    startY: number;
    initialSelectedNodes: CanvasNodeDragPosition[];
};

export function createCanvasNodeDragState(selectedIds: Set<string>, nodes: CanvasNodeData[], point: { x: number; y: number }): CanvasNodeDragState {
    return { isDraggingNode: true, hasMoved: false, startX: point.x, startY: point.y, initialSelectedNodes: getCanvasDragPositions(getCanvasDragNodeIds(selectedIds, nodes), nodes) };
}

export function resetCanvasNodeDragState(): CanvasNodeDragState {
    return { isDraggingNode: false, hasMoved: false, startX: 0, startY: 0, initialSelectedNodes: [] };
}

export function resolveCanvasNodeDragMove(start: { x: number; y: number }, point: { x: number; y: number }, zoom: number, hasMoved: boolean) {
    const screenDx = point.x - start.x;
    const screenDy = point.y - start.y;
    return { dx: screenDx / zoom, dy: screenDy / zoom, hasMoved: hasMoved || Math.abs(screenDx) > 3 || Math.abs(screenDy) > 3 };
}

export function resolveCanvasNodeDragEnd(start: { x: number; y: number }, point: { x: number; y: number } | null, zoom: number, hasMoved: boolean, initialPositions: CanvasNodeDragPosition[]) {
    return {
        dx: point ? (point.x - start.x) / zoom : 0,
        dy: point ? (point.y - start.y) / zoom : 0,
        wasClick: !hasMoved && initialPositions.length === 1,
        clickedNodeId: initialPositions.length === 1 ? initialPositions[0].id : undefined,
    };
}

export function resolveCanvasNodeDragPreview(nodes: CanvasNodeData[], state: CanvasNodeDragState, point: { x: number; y: number }, zoom: number) {
    const move = resolveCanvasNodeDragMove({ x: state.startX, y: state.startY }, point, zoom, state.hasMoved);
    return { ...move, preview: previewCanvasNodeDrag(nodes, state.initialSelectedNodes, move.dx, move.dy) };
}

export function getCanvasDragNodeIds(selectedIds: Set<string>, nodes: CanvasNodeData[]) {
    const dragIds = new Set(selectedIds);
    nodes.forEach((node) => {
        if (node.type !== CanvasNodeType.Group || !selectedIds.has(node.id)) return;
        nodes.forEach((child) => {
            if (child.metadata?.groupId === node.id) dragIds.add(child.id);
        });
    });
    return dragIds;
}

export function getCanvasDragPositions(selectedIds: Set<string>, nodes: CanvasNodeData[]): CanvasNodeDragPosition[] {
    return nodes.filter((node) => selectedIds.has(node.id)).map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }));
}

export function moveCanvasNodes(nodes: CanvasNodeData[], initialPositions: CanvasNodeDragPosition[], dx: number, dy: number) {
    const positions = new Map(initialPositions.map((item) => [item.id, item]));
    return nodes.map((node) => {
        const initial = positions.get(node.id);
        return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
    });
}

export function previewCanvasNodeDrag(nodes: CanvasNodeData[], initialPositions: CanvasNodeDragPosition[], dx: number, dy: number) {
    const moved = moveCanvasNodes(nodes, initialPositions, dx, dy);
    const movedIds = new Set(initialPositions.map((item) => item.id));
    return { nodes: moved, dropTargetGroupId: findGroupDropTarget(movedIds, moved)?.id ?? null };
}

export function finishCanvasNodeDrag(nodes: CanvasNodeData[], initialPositions: CanvasNodeDragPosition[], dx: number, dy: number) {
    const moved = moveCanvasNodes(nodes, initialPositions, dx, dy);
    const movedIds = new Set(initialPositions.map((item) => item.id));
    const targetGroup = findGroupDropTarget(movedIds, moved);
    if (targetGroup) return snapNodesIntoGroup(movedIds, moved, targetGroup);
    return moved.map((node) => {
        if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
        const groupId = findContainingGroupId(node, moved);
        return node.metadata?.groupId === groupId ? node : { ...node, metadata: { ...node.metadata, groupId } };
    });
}
