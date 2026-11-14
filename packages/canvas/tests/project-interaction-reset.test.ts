import { describe, expect, test, vi } from "vitest";
import { resetCanvasNodeDragState } from "@infinite-canvas/core/canvas/node-drag";
import { resetCanvasProjectInteraction, type CanvasProjectInteractionResetOptions } from "@infinite-canvas/core/canvas/project-interaction-reset-hook";

function createOptions() {
    const values = new Map<string, unknown>();
    const set = (key: string) => (value: unknown) => values.set(key, value);
    const options = {
        cancelPendingDragFrame: vi.fn(),
        cancelFocusAnimation: vi.fn(),
        dragRef: { current: { ...resetCanvasNodeDragState(), isDraggingNode: true, hasMoved: true } },
        selectionBoxRef: { current: { startWorldX: 1, startWorldY: 1, currentWorldX: 2, currentWorldY: 2, additive: false, initialSelectedNodeIds: [] } },
        connectingParamsRef: { current: { nodeId: "node-1", handleType: "source" as const } },
        connectionTargetNodeIdRef: { current: "node-2" },
        pendingConnectionCreateRef: { current: { connection: { nodeId: "node-1", handleType: "source" as const }, position: { x: 4, y: 5 } } },
        pendingSelectionRef: { current: new Set(["node-1"]) },
        nodeDraggingRef: { current: true },
        historyPausedRef: { current: true },
        setRunningNodeId: set("runningNodeId"),
        setCropSaving: set("cropSaving"),
        setMaskSaving: set("maskSaving"),
        setSplitSaving: set("splitSaving"),
        setUpscaleSaving: set("upscaleSaving"),
        setSplitBatch: set("splitBatch"),
        setIsNodeDragging: set("isNodeDragging"),
        setIsNodeResizing: set("isNodeResizing"),
        setSelectedNodeIds: set("selectedNodeIds"),
        setSelectedConnectionId: set("selectedConnectionId"),
        setConnectionTargetNodeId: set("connectionTargetNodeId"),
        setPendingConnectionCreate: set("pendingConnectionCreate"),
        setConnectingParams: set("connectingParams"),
        setMouseWorld: set("mouseWorld"),
        setSelectionBox: set("selectionBox"),
        setContextMenu: set("contextMenu"),
        setNodeCreatePosition: set("nodeCreatePosition"),
        setClearConfirmOpen: set("clearConfirmOpen"),
        setHoveredNodeId: set("hoveredNodeId"),
        setToolbarNodeId: set("toolbarNodeId"),
        setDialogNodeId: set("dialogNodeId"),
        setInfoNodeId: set("infoNodeId"),
        setCropNodeId: set("cropNodeId"),
        setMaskEditNodeId: set("maskEditNodeId"),
        setSplitNodeId: set("splitNodeId"),
        setUpscaleNodeId: set("upscaleNodeId"),
        setAngleNodeId: set("angleNodeId"),
        setPreviewNodeId: set("previewNodeId"),
        setPreviewImageId: set("previewImageId"),
        setReferencePickerNodeId: set("referencePickerNodeId"),
        setTitleEditing: set("titleEditing"),
        setTitleDraft: set("titleDraft"),
        setVersionsOpen: set("versionsOpen"),
        setAssetPickerOpen: set("assetPickerOpen"),
        setPluginManagerOpen: set("pluginManagerOpen"),
        setExpandedBatchNodeIds: set("expandedBatchNodeIds"),
        setDropTargetGroupId: set("dropTargetGroupId"),
        setNodeImageSettingsOpen: set("nodeImageSettingsOpen"),
    } as unknown as CanvasProjectInteractionResetOptions;
    return { options, values };
}

describe("project interaction reset", () => {
    test("clears transient interaction refs and overlays without touching document data", () => {
        const { options, values } = createOptions();

        resetCanvasProjectInteraction(options);

        expect(options.cancelPendingDragFrame).toHaveBeenCalledOnce();
        expect(options.cancelFocusAnimation).toHaveBeenCalledOnce();
        expect(options.dragRef.current).toEqual(resetCanvasNodeDragState());
        expect(options.selectionBoxRef.current).toBeNull();
        expect(options.connectingParamsRef.current).toBeNull();
        expect(options.connectionTargetNodeIdRef.current).toBeNull();
        expect(options.pendingConnectionCreateRef.current).toBeNull();
        expect(options.pendingSelectionRef.current).toBeNull();
        expect(options.nodeDraggingRef.current).toBe(false);
        expect(options.historyPausedRef.current).toBe(false);
        expect(values.get("selectedNodeIds")).toEqual(new Set());
        expect(values.get("selectedConnectionId")).toBeNull();
        expect(values.get("nodeImageSettingsOpen")).toBe(false);
        expect(values.get("dropTargetGroupId")).toBeNull();
        expect(values.get("expandedBatchNodeIds")).toEqual(new Set());
    });
});
