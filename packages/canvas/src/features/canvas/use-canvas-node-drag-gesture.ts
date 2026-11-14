import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { CanvasNodeData, ViewportTransform } from "../../types/canvas";
import { createCanvasNodeDragState, finishCanvasNodeDrag, moveCanvasNodes, resolveCanvasNodeDragEnd, resolveCanvasNodeDragPreview, resetCanvasNodeDragState, type CanvasNodeDragState } from "./node-drag";

export type CanvasNodeDragGestureOptions = {
    dragRef: MutableRefObject<CanvasNodeDragState>;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    viewportRef: MutableRefObject<ViewportTransform>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setDropTargetGroupId: (groupId: string | null) => void;
    nodeDraggingRef?: MutableRefObject<boolean>;
    historyPausedRef?: MutableRefObject<boolean>;
    setIsNodeDragging?: Dispatch<SetStateAction<boolean>>;
    onNodeClick?: (nodeId: string) => void;
};

export function useCanvasNodeDragGesture({ dragRef, nodesRef, viewportRef, setNodes, setDropTargetGroupId, nodeDraggingRef, historyPausedRef, setIsNodeDragging, onNodeClick }: CanvasNodeDragGestureOptions) {
    const frameRef = useRef<number | null>(null);

    const cancelPendingFrame = useCallback(() => {
        if (frameRef.current == null) return;
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
    }, []);

    useEffect(() => cancelPendingFrame, [cancelPendingFrame]);

    const start = useCallback((selectedIds: Set<string>, point: { x: number; y: number }) => {
        dragRef.current = createCanvasNodeDragState(selectedIds, nodesRef.current, point);
        if (historyPausedRef) historyPausedRef.current = true;
        if (nodeDraggingRef) nodeDraggingRef.current = true;
        setIsNodeDragging?.(true);
    }, [dragRef, historyPausedRef, nodeDraggingRef, nodesRef, setIsNodeDragging]);

    const onMouseMove = useCallback((event: MouseEvent) => {
        const state = dragRef.current;
        if (!state.isDraggingNode) return false;

        const move = resolveCanvasNodeDragPreview(nodesRef.current, state, { x: event.clientX, y: event.clientY }, viewportRef.current.k);
        state.hasMoved = move.hasMoved;
        setDropTargetGroupId(move.preview.dropTargetGroupId);

        cancelPendingFrame();
        const initialPositions = state.initialSelectedNodes;
        frameRef.current = requestAnimationFrame(() => {
            setNodes((previous) => moveCanvasNodes(previous, initialPositions, move.dx, move.dy));
            frameRef.current = null;
        });
        return true;
    }, [cancelPendingFrame, dragRef, nodesRef, setDropTargetGroupId, setNodes, viewportRef]);

    const finish = useCallback((clientX?: number, clientY?: number) => {
        cancelPendingFrame();
        if (!dragRef.current.isDraggingNode) return;

        const { startX, startY, hasMoved, initialSelectedNodes } = dragRef.current;
        const end = resolveCanvasNodeDragEnd(
            { x: startX, y: startY },
            clientX == null || clientY == null ? null : { x: clientX, y: clientY },
            viewportRef.current.k,
            hasMoved,
            initialSelectedNodes,
        );

        if (historyPausedRef) historyPausedRef.current = false;
        if (nodeDraggingRef) nodeDraggingRef.current = false;
        setIsNodeDragging?.(false);
        setDropTargetGroupId(null);
        if (hasMoved && clientX != null && clientY != null) {
            setNodes((previous) => finishCanvasNodeDrag(previous, initialSelectedNodes, end.dx, end.dy));
        }

        dragRef.current = resetCanvasNodeDragState();
        if (end.wasClick && end.clickedNodeId) onNodeClick?.(end.clickedNodeId);
    }, [cancelPendingFrame, dragRef, historyPausedRef, nodeDraggingRef, onNodeClick, setDropTargetGroupId, setIsNodeDragging, setNodes, viewportRef]);

    return { start, onMouseMove, cancelPendingFrame, finish };
}
