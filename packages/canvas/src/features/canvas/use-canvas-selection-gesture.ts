import { useCallback, type MutableRefObject } from "react";
import type { CanvasNodeData, Position, SelectionBox } from "../../types/canvas";
import { resolveCanvasSelectionMove } from "./selection-gesture";

export type CanvasSelectionGestureOptions = {
    selectionBoxRef: MutableRefObject<SelectionBox | null>;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    setSelectionBox: (selection: SelectionBox | null) => void;
    setSelectedNodeIds: (ids: Set<string>) => void;
};

export function useCanvasSelectionGesture({ selectionBoxRef, nodesRef, screenToCanvas, setSelectionBox, setSelectedNodeIds }: CanvasSelectionGestureOptions) {
    const clearSelectionGesture = useCallback(() => {
        selectionBoxRef.current = null;
        setSelectionBox(null);
    }, [selectionBoxRef, setSelectionBox]);

    const onPointerMove = useCallback((event: PointerEvent) => {
        const selection = selectionBoxRef.current;
        if (!selection) return;

        const result = resolveCanvasSelectionMove(nodesRef.current, selection, screenToCanvas(event.clientX, event.clientY), event.buttons);
        if (!result) {
            clearSelectionGesture();
            return;
        }

        selectionBoxRef.current = result.selection;
        setSelectionBox(result.selection);
        setSelectedNodeIds(result.selectedIds);
    }, [clearSelectionGesture, nodesRef, screenToCanvas, selectionBoxRef, setSelectedNodeIds, setSelectionBox]);

    return { onPointerMove, clearSelectionGesture };
}
