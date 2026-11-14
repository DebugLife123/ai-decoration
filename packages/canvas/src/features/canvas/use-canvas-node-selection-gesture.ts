import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { selectCanvasNode } from "./node-selection";

export type CanvasNodeSelectionGestureOptions = {
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setToolbarNodeId: (nodeId: string | null) => void;
    setContextMenu: (value: null) => void;
    setHoveredNodeId: (nodeId: string | null) => void;
    setSelectedConnectionId: (connectionId: string | null) => void;
    startNodeDrag: (selectedIds: Set<string>, point: { x: number; y: number }) => void;
};

export function useCanvasNodeSelectionGesture({
    selectedNodeIdsRef,
    setSelectedNodeIds,
    setToolbarNodeId,
    setContextMenu,
    setHoveredNodeId,
    setSelectedConnectionId,
    startNodeDrag,
}: CanvasNodeSelectionGestureOptions) {
    const pendingSelectionRef = useRef<Set<string> | null>(null);

    const selectNodeByEvent = useCallback((event: Pick<ReactMouseEvent, "shiftKey" | "metaKey" | "ctrlKey">, nodeId: string) => {
        const { nextSelected, soloId } = selectCanvasNode(
            selectedNodeIdsRef.current,
            nodeId,
            event.shiftKey || event.metaKey || event.ctrlKey,
        );
        setSelectedNodeIds(nextSelected);
        setToolbarNodeId(soloId);
        return { nextSelected, soloId };
    }, [selectedNodeIdsRef, setSelectedNodeIds, setToolbarNodeId]);

    const handleNodeSelectCapture = useCallback((event: ReactMouseEvent, nodeId: string) => {
        if (event.button !== 0) return;
        setContextMenu(null);
        setHoveredNodeId(null);
        setSelectedConnectionId(null);
        pendingSelectionRef.current = selectNodeByEvent(event, nodeId).nextSelected;
    }, [selectNodeByEvent, setContextMenu, setHoveredNodeId, setSelectedConnectionId]);

    const handleNodeMouseDown = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.stopPropagation();
        const nextSelected = pendingSelectionRef.current ?? selectNodeByEvent(event, nodeId).nextSelected;
        pendingSelectionRef.current = null;
        startNodeDrag(nextSelected, { x: event.clientX, y: event.clientY });
    }, [selectNodeByEvent, startNodeDrag]);

    return { handleNodeSelectCapture, handleNodeMouseDown, pendingSelectionRef };
}
