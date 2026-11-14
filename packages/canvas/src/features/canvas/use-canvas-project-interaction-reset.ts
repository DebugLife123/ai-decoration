import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ConnectionHandle, ContextMenuState, Position, SelectionBox } from "../../types/canvas";
import type { CanvasSplitBatch } from "./split-image";
import { resetCanvasNodeDragState, type CanvasNodeDragState } from "./node-drag";

export type CanvasPendingConnectionCreate = { connection: ConnectionHandle; position: Position };

export type CanvasProjectInteractionResetOptions = {
    cancelPendingDragFrame: () => void;
    cancelFocusAnimation: () => void;
    dragRef: MutableRefObject<CanvasNodeDragState>;
    selectionBoxRef: MutableRefObject<SelectionBox | null>;
    connectingParamsRef: MutableRefObject<ConnectionHandle | null>;
    connectionTargetNodeIdRef: MutableRefObject<string | null>;
    pendingConnectionCreateRef: MutableRefObject<CanvasPendingConnectionCreate | null>;
    pendingSelectionRef: MutableRefObject<Set<string> | null>;
    nodeDraggingRef: MutableRefObject<boolean>;
    historyPausedRef: MutableRefObject<boolean>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    setCropSaving: Dispatch<SetStateAction<boolean>>;
    setMaskSaving: Dispatch<SetStateAction<boolean>>;
    setSplitSaving: Dispatch<SetStateAction<boolean>>;
    setUpscaleSaving: Dispatch<SetStateAction<boolean>>;
    setSplitBatch: Dispatch<SetStateAction<CanvasSplitBatch | null>>;
    setIsNodeDragging: Dispatch<SetStateAction<boolean>>;
    setIsNodeResizing: Dispatch<SetStateAction<boolean>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setConnectionTargetNodeId: Dispatch<SetStateAction<string | null>>;
    setPendingConnectionCreate: Dispatch<SetStateAction<CanvasPendingConnectionCreate | null>>;
    setConnectingParams: Dispatch<SetStateAction<ConnectionHandle | null>>;
    setMouseWorld: Dispatch<SetStateAction<Position>>;
    setSelectionBox: Dispatch<SetStateAction<SelectionBox | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setNodeCreatePosition: Dispatch<SetStateAction<Position | null>>;
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setInfoNodeId: Dispatch<SetStateAction<string | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setMaskEditNodeId: Dispatch<SetStateAction<string | null>>;
    setSplitNodeId: Dispatch<SetStateAction<string | null>>;
    setUpscaleNodeId: Dispatch<SetStateAction<string | null>>;
    setAngleNodeId: Dispatch<SetStateAction<string | null>>;
    setPreviewNodeId: Dispatch<SetStateAction<string | null>>;
    setPreviewImageId: Dispatch<SetStateAction<string | null>>;
    setReferencePickerNodeId: Dispatch<SetStateAction<string | null>>;
    setTitleEditing: Dispatch<SetStateAction<boolean>>;
    setTitleDraft: Dispatch<SetStateAction<string>>;
    setVersionsOpen: Dispatch<SetStateAction<boolean>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    setPluginManagerOpen: Dispatch<SetStateAction<boolean>>;
    setExpandedBatchNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setDropTargetGroupId: Dispatch<SetStateAction<string | null>>;
    setNodeImageSettingsOpen: Dispatch<SetStateAction<boolean>>;
};

export function resetCanvasProjectInteraction(options: CanvasProjectInteractionResetOptions) {
    options.cancelPendingDragFrame();
    options.cancelFocusAnimation();
    options.dragRef.current = resetCanvasNodeDragState();
    options.selectionBoxRef.current = null;
    options.connectingParamsRef.current = null;
    options.connectionTargetNodeIdRef.current = null;
    options.pendingConnectionCreateRef.current = null;
    options.pendingSelectionRef.current = null;
    options.nodeDraggingRef.current = false;
    options.historyPausedRef.current = false;
    options.setRunningNodeId(null);
    options.setCropSaving(false);
    options.setMaskSaving(false);
    options.setSplitSaving(false);
    options.setUpscaleSaving(false);
    options.setSplitBatch(null);
    options.setIsNodeDragging(false);
    options.setIsNodeResizing(false);
    options.setSelectedNodeIds(new Set());
    options.setSelectedConnectionId(null);
    options.setConnectionTargetNodeId(null);
    options.setPendingConnectionCreate(null);
    options.setConnectingParams(null);
    options.setMouseWorld({ x: 0, y: 0 });
    options.setSelectionBox(null);
    options.setContextMenu(null);
    options.setNodeCreatePosition(null);
    options.setClearConfirmOpen(false);
    options.setHoveredNodeId(null);
    options.setToolbarNodeId(null);
    options.setDialogNodeId(null);
    options.setInfoNodeId(null);
    options.setCropNodeId(null);
    options.setMaskEditNodeId(null);
    options.setSplitNodeId(null);
    options.setUpscaleNodeId(null);
    options.setAngleNodeId(null);
    options.setPreviewNodeId(null);
    options.setPreviewImageId(null);
    options.setReferencePickerNodeId(null);
    options.setTitleEditing(false);
    options.setTitleDraft("");
    options.setVersionsOpen(false);
    options.setAssetPickerOpen(false);
    options.setPluginManagerOpen(false);
    options.setExpandedBatchNodeIds(new Set());
    options.setDropTargetGroupId(null);
    options.setNodeImageSettingsOpen(false);
}

export function useCanvasProjectInteractionReset(projectId: string, resetInteraction: () => void) {
    const previousProjectIdRef = useRef(projectId);

    useEffect(() => {
        if (previousProjectIdRef.current === projectId) return;
        previousProjectIdRef.current = projectId;
        resetInteraction();
    }, [projectId, resetInteraction]);
}
