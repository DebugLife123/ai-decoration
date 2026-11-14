import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCanvasHost, useCanvasTheme } from "./canvas-host";
import { claimCanvasAgentAutoOpen } from "./agent-entry";
import { hasCanvasHistoryChanged } from "./history-change";
import { commitCanvasHistory, createCanvasHistoryStack, moveCanvasHistory } from "./history-stack";
import { buildCanvasConnectedNodesByTarget, countCanvasGroupChildren, getCanvasReferenceConnectedNodeIds, getCanvasRelatedHighlight } from "./node-relations";
import { useCanvasGenerationRequests } from "./use-canvas-generation-requests";
import { resolveCanvasGenerationOutcome } from "./generation-outcome";
import { applyCanvasGenerationFailure, applyCanvasGenerationTargetsFailure, resolveCanvasGenerationFailure } from "./generation-failure";
import { applyCanvasGenerationCancellation } from "./generation-cancel";
import { summarizeCanvasGenerationBatch } from "./generation-batch-state";
import { applyCanvasTextBatchSummary, summarizeCanvasTextBatch } from "./generation-text-batch";
import { applyCanvasTextDelta, applyCanvasTextNodeDelta, applyCanvasTextNodeResult, applyCanvasTextResult } from "./generation-text-result";
import { applyCanvasTextGenerationPlan, createCanvasTextGenerationPlan } from "./generation-text-plan";
import { applyCanvasRetryImageResult } from "./generation-result";
import { executeCanvasImageRetry } from "./image-retry-execution";
import { executeCanvasBatchImageAttempt } from "./batch-image-execution";
import { executeCanvasImageWriteback } from "./image-writeback-execution";
import { applyCanvasImageWritebackResult } from "./image-writeback-result";
import { applyCanvasImageEditAction } from "./image-edit-action";
import { executeCanvasAudioTask } from "./audio-execution";
import { executeCanvasVideoTask, resumeCanvasVideoTask } from "./video-execution";
import { applyCanvasGenerationStart } from "./generation-start-state";
import { useCanvasConfigAccess } from "./use-canvas-config-access";
import { applyCanvasImageGenerationPlan, createCanvasImageGenerationPlan } from "./generation-image-plan";
import { applyCanvasGeneratedMediaPlan, createCanvasGeneratedMediaPlan } from "./generation-media-plan";
import { resizeCanvasNode, toggleCanvasNodeFreeResize } from "./node-resize";
import type { CanvasKeyboardCommand } from "./keyboard-shortcuts";
import { type CanvasHistorySnapshot, type CanvasProjectRestoreState } from "./project-restore-state";
import { useCanvasProjectLifecycle } from "./use-project-lifecycle";
import { createCanvasBatchImageCopy, deleteCanvasBatchImage, setCanvasBatchPrimary } from "./batch-image-actions";
import { applyCanvasBatchImageAttemptResult, applyCanvasBatchImageSummary } from "./batch-image-result";
import { screenPointToCanvas } from "./coordinates";
import { applyCanvasVideoResult } from "./video-result";
import { applyCanvasVideoTaskHandle } from "./video-task-metadata";
import { buildCanvasVideoGenerationMetadata, buildCanvasVideoSettings } from "./video-generation-config";
import { applyCanvasAudioResult } from "./audio-result";
import { buildCanvasAudioGenerationMetadata, buildCanvasAudioSettings } from "./audio-generation-config";
import { resolveCanvasSplitWriteback } from "./split-result";
import { createCanvasMaskEditPlan } from "./mask-edit-plan";
import { createCanvasAngleEditPlan } from "./angle-edit-plan";
import { findCanvasConnectionDropTarget, getVisibleCanvasNodes } from "./viewport-geometry";
import { getCanvasSelectionBoxBounds } from "./selection-geometry";
import { createCanvasSelectionBox } from "./selection-gesture";
import { resetCanvasNodeDragState, type CanvasNodeDragState } from "./node-drag";
import { useCanvasNodeDragGesture } from "./use-canvas-node-drag-gesture";
import { disconnectCanvasReference, hasCanvasConnection, normalizeCanvasConnection, removeCanvasConnection } from "./connection-actions";
import { removeCanvasNodes } from "./node-delete";
import { copyCanvasSelection, duplicateCanvasNode, pasteCanvasClipboard, type CanvasClipboard } from "./node-clipboard";
import { pasteCanvasSystemClipboard } from "./system-clipboard";
import { useCanvasVersionRestore } from "./use-canvas-version-restore";
import { useCanvasProjectOperationScopes } from "./use-canvas-project-operation-scopes";
import { type CanvasProjectSaveScope } from "./project-save";
import { useCanvasProjectPersistence, type CanvasProjectHistoryBaseline } from "./use-project-persistence";
import { useCanvasWindowInteractionEvents } from "./use-canvas-window-interaction-events";
import { useCanvasSelectionGesture } from "./use-canvas-selection-gesture";
import { useCanvasNodeSelectionGesture } from "./use-canvas-node-selection-gesture";
import { useCanvasKeyboardShortcuts } from "./use-canvas-keyboard-shortcuts";
import { useCanvasConnectionGesture } from "./use-canvas-connection-gesture";
import { useCanvasViewportCommands } from "./use-canvas-viewport-commands";
import { resetCanvasProjectInteraction, useCanvasProjectInteractionReset } from "./use-canvas-project-interaction-reset";
import { applyCanvasAssetCommandMetadata, canvasAssetMetadata } from "./asset-import";
import { createCanvasProjectAssetNode } from "./project-asset-node";
import { createCanvasUserAsset } from "./user-asset";
import { createCanvasImportPlan, filterCanvasImportFiles, matchesCanvasFileKind, type CanvasFileKind } from "./file-import-policy";
import { replaceCanvasNodeInList, type CanvasImportedFileNode } from "./file-import";
import { useCanvasFileImport } from "./use-canvas-file-import";
import { importCanvasResultImage } from "./result-image";
import { readCanvasReferenceImages, type CanvasMediaCleanupReason } from "./media";
import { useCanvasMaskAssetActions } from "./use-canvas-mask-asset-actions";
import { useCanvasImageDerivativeActions, type CanvasImageDerivativeKind } from "./use-canvas-image-derivative-actions";
import type { CanvasSplitBatch } from "./split-image";
import { useCanvasImageSplitActions } from "./use-canvas-image-split-actions";
import { useCanvasImageEditExecution } from "./use-canvas-image-edit-execution";
import { submitCanvasNodeTask } from "./node-task-submission";
import type { CanvasEditorAssetCommand, CanvasProjectAsset, CanvasProjectDocument, SubmitCanvasTask } from "./contracts";
import { RefreshCw } from "lucide-react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { defaultCanvasGenerationPreferences, buildCanvasGenerationConfig as buildGenerationConfig, type CanvasGenerationConfig } from "./generation-preferences";
import { createCanvasRetryPlan } from "./retry-plan";
import { prepareCanvasRetry, readCanvasRetryReferences } from "./retry-preparation";
import { nanoid } from "nanoid";
import { imageReferenceLabel } from "../../lib/image-reference-prompt";
import type { CanvasBackgroundMode } from "../../lib/canvas-theme";
import { fitCanvasAssetNodeSize, fitNodeSize, nodeSizeFromRatio } from "../../lib/canvas/canvas-node-size";
import { captureVideoFrame, type VideoFramePosition } from "../../lib/canvas/canvas-video-frame";
import { App, Button, Modal } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "../../constant/canvas";
import { ActiveConnectionPath, ConnectionPath } from "../../components/canvas/canvas-connections";
import { CanvasConfigComposer } from "../../components/canvas/canvas-config-composer";
import { CanvasConfigNodePanel } from "../../components/canvas/canvas-config-node-panel";
import { CanvasNodeContextMenu } from "../../components/canvas/canvas-context-menu";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "../../components/canvas/canvas-node-angle-dialog";
import { CanvasNodeCropDialog } from "../../components/canvas/canvas-node-crop-dialog";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "../../components/canvas/canvas-node-mask-edit-dialog";
import { CanvasNodeSplitDialog } from "../../components/canvas/canvas-node-split-dialog";
import { CanvasNodeUpscaleDialog } from "../../components/canvas/canvas-node-upscale-dialog";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext, type NodeGenerationInput } from "../../components/canvas/canvas-node-generation";
import { CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "../../components/canvas/canvas-node-hover-toolbar";
import { CanvasSelectionToolbar } from "../../components/canvas/canvas-selection-toolbar";
import { InfiniteCanvas } from "../../components/canvas/infinite-canvas";
import { Minimap } from "../../components/canvas/canvas-mini-map";
import { CanvasNode } from "../../components/canvas/canvas-node";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "../../components/canvas/canvas-node-prompt-panel";
import { CanvasToolbar } from "../../components/canvas/canvas-toolbar";
import { AssetPickerModal, type InsertAssetPayload } from "../../components/canvas/asset-picker-modal";
import { CANVAS_ASSET_DRAG_MIME, parseCanvasAssetDragData } from "./asset-library";
import { CanvasSidePanel } from "../../components/canvas/canvas-side-panel";
import { CanvasInspectorPanel } from "../../components/canvas/canvas-inspector-panel";
import { CanvasZoomControls } from "../../components/canvas/canvas-zoom-controls";
import type { CanvasVersionDocument } from "./contracts";
import { useAgentBridge } from "./use-agent-bridge";
import { usePluginHost } from "./use-plugin-host";
import { buildNodeMentionReferences, isCanvasReferenceNode, type CanvasResourceReference } from "../../lib/canvas/canvas-resource-references";
import { exportCanvasResults } from "../../lib/canvas/canvas-export";
import { applyLayoutPositions, layoutCanvasNodes } from "../../lib/canvas/canvas-auto-layout";
import { buildImageGenerationMetadata, createCanvasNode } from "../../lib/canvas/canvas-node-factory";
import { applyCanvasNodeConfigPatch, markCanvasNodeError, updateCanvasNodeContent, updateCanvasNodeFontSize, updateCanvasNodePrompt, updateCanvasNodeTitle } from "./node-state-actions";
import {
    applyGroupSelection,
    applyUngroupSelection,
    canGroupSelectedNodes,
    canUngroupSelectedNodes,
    collectGroupMemberNodes,
    getGroupWrapRect,
} from "./group-actions";
import {
    audioExtension,
    buildAngleLabel,
    buildAnglePrompt,
    generationReferenceUrls,
    getGenerationCount,
    getInputSummary,
    hasResumableVideoTask,
    imageExtension,
    isGenerationCanceled,
    sourceNodeReferenceImages,
} from "../../lib/canvas/canvas-generation-helpers";
import { getNodeDefinition, isBuiltinNodeType as isBuiltinType, useNodeRegistryVersion } from "../../lib/canvas/node-registry";
import { registerBuiltinNodes } from "../../components/canvas/nodes/builtin-nodes";
import { getResumableVideoTaskHandle, hasVideoTaskReference } from "../../lib/canvas/video-task-handle";
import { CanvasPluginManagerModal } from "../../components/canvas/canvas-plugin-manager-modal";
import { CanvasRefreshShell } from "../../components/canvas/canvas-refresh-shell";
import { CanvasTopBar } from "../../components/canvas/canvas-top-bar";
import { CanvasVersionHistoryDialog } from "../../components/canvas/canvas-version-history-dialog";
import { ConnectionCreateMenu, NodeCreateMenu, type PendingConnectionCreate } from "../../components/canvas/canvas-create-menus";
import {
    CanvasNodeType,
    type CanvasAssistantImage,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasNodeData,
    type CanvasNodeImage,
    type CanvasNodeText,
    type CanvasNodeMetadata,
    type CanvasNodeTypeId,
    type ConnectionHandle,
    type ContextMenuState,
    type Position,
    type SelectionBox,
    type ViewportTransform,
} from "../../types/canvas";
import type { ReferenceImage } from "../../types/image";
import type { ReferenceAudio, ReferenceVideo } from "../../types/media";

// Register built-in nodes in the shared registry once when the module loads.
registerBuiltinNodes();

type CanvasHistoryEntry = CanvasHistorySnapshot;

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
// Stable empty reference array prevents `... || []` from invalidating CanvasNode's React.memo on every render.
const EMPTY_REFERENCES: CanvasResourceReference[] = [];
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;

export function CanvasEditor() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <InfiniteCanvasPage />;
}

function InfiniteCanvasPage() {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    // Subscribe to the registry version so plugin registration changes rerender the canvas.
    const nodeRegistryVersion = useNodeRegistryVersion((state) => state.version);
    const { projectId, projects, navigate, searchParams, mode: hostMode, editorChrome = true, importImage, importVideo, importAudio, media, imageGeneration, audioGeneration, videoGeneration, textGeneration, generationPreferences, config: configAccess, assetLibrary, assetCommand, taskExecution, taskRecords, onTaskRecordChange, addToUserAssets, agentPanel, agentBridge, directorDesk, pluginManager } = useCanvasHost();
    const renderEditorChrome = hostMode === "local" && editorChrome;
    const projectSnapshot = useSyncExternalStore(projects.subscribe, projects.getSnapshot, projects.getSnapshot);
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position; kind?: CanvasFileKind } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const historyRef = useRef(createCanvasHistoryStack());
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const autoOpenedAgentEntriesRef = useRef(new Set<string>());
    const didInitialCenterRef = useRef(false);
    const nodeDraggingRef = useRef(false);
    const dragRef = useRef<CanvasNodeDragState>(resetCanvasNodeDragState());
    const insertProjectAssetRef = useRef<((command: Omit<CanvasEditorAssetCommand, "asset"> & { asset: CanvasProjectAsset }) => void) | null>(null);

    const effectiveConfig = generationPreferences || defaultCanvasGenerationPreferences;
    const { isReady: isAiConfigReady, openSettings: openConfigDialog } = useCanvasConfigAccess({ mode: hostMode, config: configAccess, notify: message.info });
    const { hydrated } = projectSnapshot;
    const { createProject, getDocument, saveDocument, renameProject, deleteProjects, exportProject } = projects;
    const currentProject = projectSnapshot.projects.find((project) => project.projectId === projectId);
    const { theme } = useCanvasTheme();
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [canvasTool, setCanvasTool] = useState<"select" | "pan">("pan");
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [nodeCreatePosition, setNodeCreatePosition] = useState<Position | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [exportingResults, setExportingResults] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [cropSaving, setCropSaving] = useState(false);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [maskSaving, setMaskSaving] = useState(false);
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [splitSaving, setSplitSaving] = useState(false);
    const [splitBatch, setSplitBatch] = useState<CanvasSplitBatch | null>(null);
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
    const [upscaleSaving, setUpscaleSaving] = useState(false);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [previewImageId, setPreviewImageId] = useState<string | null>(null);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [expandedBatchNodeIds, setExpandedBatchNodeIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [isNodeResizing, setIsNodeResizing] = useState(false);
    const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
    const [referencePickerNodeId, setReferencePickerNodeId] = useState<string | null>(null);

    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>(null);
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const selectionBoxRef = useRef(selectionBox);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const { requests: generationRequests, startGenerationRequest, finishGenerationRequest, stopGenerationRequests } = useCanvasGenerationRequests(projectId);
    const { imageImport: imageImportScopeRef, cropRequest: cropRequestRef, maskRequest: maskRequestRef, splitRequest: splitRequestRef, upscaleRequest: upscaleRequestRef } = useCanvasProjectOperationScopes(projectId);
    const canvasVersionBaselineRef = useRef<CanvasProjectHistoryBaseline | null>(null);
    const handledAssetCommandRef = useRef("");
    const hostVersionIdRef = useRef<string | null>(null);
    const projectDocumentRef = useRef<CanvasProjectDocument | null>(null);
    const handleNodeClickAfterDrag = useCallback((nodeId: string) => {
        const clickedNode = nodesRef.current.find((node) => node.id === nodeId);
        const clickedDefinition = clickedNode ? getNodeDefinition(clickedNode.type) : undefined;
        if (clickedDefinition?.hidePanel) {
            setDialogNodeId((current) => (current === nodeId ? current : null));
        } else if (clickedNode?.type !== CanvasNodeType.Group) {
            setDialogNodeId(nodeId);
        }
    }, []);
    const nodeDragGesture = useCanvasNodeDragGesture({ dragRef, nodesRef, viewportRef, setNodes, setDropTargetGroupId, nodeDraggingRef, historyPausedRef, setIsNodeDragging, onNodeClick: handleNodeClickAfterDrag });
    const nodeSelectionGesture = useCanvasNodeSelectionGesture({
        selectedNodeIdsRef,
        setSelectedNodeIds,
        setToolbarNodeId,
        setContextMenu,
        setHoveredNodeId,
        setSelectedConnectionId,
        startNodeDrag: nodeDragGesture.start,
    });
    const { cancelFocusAnimation, fitCanvasToNodes, focusNode, resetViewport, setZoomScale } = useCanvasViewportCommands({ nodesRef, viewportRef, width: size.width, height: size.height, setViewport, setSelectedNodeIds, setSelectedConnectionId, setContextMenu });
    const { restoreVersion } = useCanvasVersionRestore({ projectId, currentDocument: projectDocumentRef, media, saveDocument });
    const applyRestoredProject = useCallback((restored: CanvasProjectRestoreState) => {
        projectDocumentRef.current = restored.document;
        setNodes(restored.document.nodes);
        setConnections(restored.document.connections);
        setChatSessions(restored.document.chatSessions);
        setActiveChatId(restored.document.activeChatId);
        setBackgroundMode(restored.document.backgroundMode);
        setShowImageInfo(restored.document.showImageInfo);
        setViewport(restored.document.viewport);
        canvasVersionBaselineRef.current = restored.baseline;
        historyRef.current = createCanvasHistoryStack();
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        lastHistoryRef.current = { ...restored.history };
        setHistoryState({ canUndo: false, canRedo: false });
    }, []);
    const clearProjectDocument = useCallback(() => { projectDocumentRef.current = null; }, []);
    const { ready: projectReady, loaded: projectLoaded, error: projectLoadError, attempt: projectLoadAttempt, retry: retryProjectLoad } = useCanvasProjectLifecycle({
        projectId,
        hydrated,
        getDocument,
        media,
        navigate,
        onLoadStart: clearProjectDocument,
        onRestore: applyRestoredProject,
    });
    const projectSaveScopeRef = useRef<CanvasProjectSaveScope>({ projectId, projectLoadAttempt });
    projectSaveScopeRef.current = { projectId, projectLoadAttempt };

    const handleProjectPersistenceError = useCallback((kind: "document" | "viewport", error: unknown) => {
        message.error(error instanceof Error ? error.message : kind === "viewport" ? "视口保存失败" : "画布保存失败");
    }, [message]);

    useCanvasProjectPersistence({
        projectId,
        projectLoadAttempt,
        projectReady,
        saveDocument,
        nodes,
        connections,
        chatSessions,
        activeChatId,
        backgroundMode,
        showImageInfo,
        viewport,
        refs: {
            projectDocument: projectDocumentRef,
            projectSaveScope: projectSaveScopeRef,
            hostVersionId: hostVersionIdRef,
            historyBaseline: canvasVersionBaselineRef,
            viewport: viewportRef,
            historyPaused: historyPausedRef,
        },
        onError: handleProjectPersistenceError,
    });

    const saveResultImage = useCallback((source: string | Blob, name: string, signal = imageImportScopeRef.current.signal) =>
        importCanvasResultImage(importImage, projectId, source, name, signal, (url, referenceName, readSignal) => media.readMedia(projectId, { name: referenceName, url }, readSignal || new AbortController().signal)), [importImage, media, projectId]);

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
        }),
        [activeChatId, backgroundMode, chatSessions, showImageInfo],
    );

    const cleanupCanvasFiles = useCallback(
        (extra: unknown, reason: CanvasMediaCleanupReason) => {
            media.cleanup({ projectId, reason, extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [media, projectId],
    );

    const completeVideoNodeTask = useCallback(
        async (
            nodeId: string,
            config: CanvasGenerationConfig,
            prompt: string,
            images: ReferenceImage[],
            signal: AbortSignal,
            extra: CanvasNodeData["metadata"] = {},
            videos: ReferenceVideo[] = [],
            audios: ReferenceAudio[] = [],
        ) => {
            const video = await executeCanvasVideoTask({ projectId, prompt, settings: buildCanvasVideoSettings(config), references: images, videos, audios, signal, generation: videoGeneration, media, importVideo, name: `canvas-${nodeId}.mp4`, onTaskCreated: (handle) => setNodes((prev) => prev.map((item) => (item.id === nodeId ? applyCanvasVideoTaskHandle(item, handle, config.model) : item))) });
            setNodes((prev) => prev.map((item) => (item.id === nodeId ? applyCanvasVideoResult(item, video, { prompt, model: config.model, ...extra }) : item)));
        },
        [importVideo, media, projectId, videoGeneration],
    );

    const pollVideoNodeTask = useCallback(
        async (node: CanvasNodeData, silent = false) => {
            const taskId = node.metadata?.videoTaskId;
            if (!taskId || node.metadata?.content || generationRequests.has(node.id)) return;
            let controller: AbortController | undefined;
            try {
                if (!importVideo) throw new Error("当前宿主不支持视频导入");
                if (!videoGeneration) throw new Error("当前宿主不支持视频生成");
                const handle = getResumableVideoTaskHandle(node);
                if (!handle) throw new Error("保存的视频任务信息不完整，无法继续查询");
                const generationConfig = buildGenerationConfig(effectiveConfig, node, "video");
                if (!isAiConfigReady(generationConfig.model)) {
                    if (silent) {
                        setNodes((prev) => markCanvasNodeError(prev, node.id, t("workbench.configFirst")));
                        return;
                    }
                    openConfigDialog(true);
                    return;
                }
                setRunningNodeId(node.id);
                setNodes((prev) => applyCanvasGenerationStart(prev, { nodeId: node.id }));
                controller = startGenerationRequest(node.id, node.id, node.id);
                const video = await resumeCanvasVideoTask({ projectId, settings: buildCanvasVideoSettings(generationConfig), handle, signal: controller.signal, generation: videoGeneration, media, importVideo, name: `canvas-${node.id}.mp4` });
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? applyCanvasVideoResult(item, video, {
                                  prompt: item.metadata?.prompt,
                                  ...buildCanvasVideoGenerationMetadata(generationConfig),
                              })
                            : item,
                    ),
                );
            } catch (error) {
                const outcome = resolveCanvasGenerationFailure(error, controller?.signal, t("canvas.projectPage.generationFailed"), isGenerationCanceled);
                if (outcome.kind === "canceled") return;
                const errorDetails = outcome.message;
                message.error(errorDetails);
                setNodes((prev) => applyCanvasGenerationFailure(prev, { nodeId: node.id, errorDetails, videoTimedOut: outcome.videoTimedOut, videoTaskFailed: outcome.videoTaskFailed }));
            } finally {
                if (controller) {
                    finishGenerationRequest(node.id, controller);
                    if (!controller.signal.aborted) setRunningNodeId((current) => (current === node.id ? null : current));
                }
            }
        },
        [effectiveConfig, finishGenerationRequest, generationRequests, importVideo, isAiConfigReady, message, openConfigDialog, projectId, startGenerationRequest, t, videoGeneration],
    );

    const stopGenerationByRunningId = useCallback(
        (runningId: string) => {
            const affectedNodeIds = stopGenerationRequests(runningId);
            setRunningNodeId((current) => (current === runningId ? null : current));
            if (!affectedNodeIds.size) return;
            setNodes((prev) => applyCanvasGenerationCancellation(prev, affectedNodeIds, t("common.requestCanceled")));
        },
        [stopGenerationRequests, t],
    );

    const confirmStopGeneration = useCallback(
        (nodeId: string) => {
            modal.confirm({
                title: t("canvas.projectPage.stopTitle"),
                content: t("canvas.projectPage.stopDescription"),
                okText: t("canvas.projectPage.stop"),
                cancelText: t("canvas.projectPage.continue"),
                okButtonProps: { danger: true },
                onOk: () => stopGenerationByRunningId(nodeId),
            });
        },
        [modal, stopGenerationByRunningId, t],
    );

    useEffect(() => {
        if (!projectReady) return;
        nodesRef.current.filter(hasResumableVideoTask).forEach((node) => void pollVideoNodeTask(node, true));
        // Resume once after the current canvas is restored, not on later config identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectReady]);

    useEffect(() => {
        if (!projectReady || !agentPanel) return;
        const mode = searchParams.get("mode");
        if (claimCanvasAgentAutoOpen({ projectId, mode, hasCustomBootstrap: searchParams.has("agentUrl") || agentPanel.fragmentBootstrap, enabled: agentPanel.enabled }, autoOpenedAgentEntriesRef.current)) agentPanel.open();
    }, [agentPanel?.enabled, agentPanel?.fragmentBootstrap, agentPanel?.open, projectId, projectReady, searchParams]);

    useEffect(() => {
        if (!projectReady || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (!hasCanvasHistoryChanged(previous, next)) return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current = commitCanvasHistory(historyRef.current, last);
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [activeChatId, backgroundMode, chatSessions, connections, createHistoryEntry, nodes, projectReady, showImageInfo]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [nodes, connections, selectedNodeIds, viewport, connectingParams, connectionTargetNodeId, pendingConnectionCreate]);

    useLayoutEffect(() => {
        selectionBoxRef.current = selectionBox;
    }, [selectionBox]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
            if (!didInitialCenterRef.current && hostMode !== "mock" && nodesRef.current.length === 0) {
                didInitialCenterRef.current = true;
                setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [projectReady, hostMode]);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenPointToCanvas({ x: clientX, y: clientY }, rect || null, viewportRef.current);
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [screenToCanvas, size.height, size.width]);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen || !selectedNodeIdsRef.current.has(nodeId)) return;
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {}, []);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeCanvasConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType);
            if (!connection) {
                message.warning(t("canvas.projectPage.configConnection"));
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = hasCanvasConnection(connectionsRef.current, fromNodeId, toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, fromNodeId, toNodeId }]);
            }
            setContextMenu(null);
        },
        [message, t],
    );

    const createConnectedNode = useCallback(
        (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio, pending: PendingConnectionCreate) => {
            const metadata = type === CanvasNodeType.Config ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count) } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            const connection = normalizeCanvasConnection(pending.connection.nodeId, newNode.id, [...nodesRef.current, newNode], pending.connection.handleType);
            if (!connection) {
                message.warning(t("canvas.projectPage.configConnection"));
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);
            setPendingConnectionCreate(null);
            setConnecting(null);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, setConnecting, t],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle) => findCanvasConnectionDropTarget(screenToCanvas(clientX, clientY), viewportRef.current.k, current, nodesRef.current),
        [screenToCanvas],
    );
    const updateConnectionTarget = useCallback((nodeId: string | null) => {
        connectionTargetNodeIdRef.current = nodeId;
        setConnectionTargetNodeId(nodeId);
    }, []);
    const connectionGesture = useCanvasConnectionGesture({
        connectingParamsRef,
        pendingConnectionCreateRef,
        getConnectionDropTarget,
        screenToCanvas,
        setConnectionTargetNodeId: updateConnectionTarget,
        setMouseWorld,
        setPendingConnectionCreate,
        setConnecting,
        connectNodes,
    });

    const visibleNodes = useMemo(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return getVisibleCanvasNodes(nodes, { x: viewport.x, y: viewport.y, k: viewport.k }, { width: rect?.width || size.width, height: rect?.height || size.height });
    }, [nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    // The toolbar follows a single selected node selected by click, creation, marquee, or keyboard.
    // It stays hidden for multi-selection and while isNodeDragging is true.
    const singleSelectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const toolbarNode = (toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null) || (singleSelectedNodeId ? nodeById.get(singleSelectedNodeId) || null : null);
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const contextMenuNode = contextMenu?.type === "node" ? nodeById.get(contextMenu.nodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const previewContent = previewImageId ? previewNode?.metadata?.images?.find((image) => image.id === previewImageId)?.content : previewNode?.metadata?.content;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const selectedNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id)), [nodes, selectedNodeIds]);
    const canGroupSelection = canGroupSelectedNodes(selectedNodeIds, nodes);
    const canUngroupSelection = canUngroupSelectedNodes(selectedNodeIds, nodes);
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const groupChildCountById = useMemo(() => countCanvasGroupChildren(nodes), [nodes]);
    const relatedHighlight = useMemo(() => getCanvasRelatedHighlight(activeNodeId, nodes, connections), [activeNodeId, connections, nodes]);

    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);
    const mentionReferencesByNodeId = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        nodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, nodes, connections)));
        return map;
    }, [connections, nodes]);
    const connectedNodesByNodeId = useMemo(() => buildCanvasConnectedNodesByTarget(nodes, connections), [connections, nodes]);
    const referenceConnectedNodeIds = useMemo(
        () => getCanvasReferenceConnectedNodeIds(referencePickerNodeId, connectedNodesByNodeId, nodes),
        [connectedNodesByNodeId, nodes, referencePickerNodeId],
    );
    const { applyAgentOps } = useAgentBridge({
        enabled: hostMode !== "mock" && projectReady,
        scopeKey: JSON.stringify([projectId, projectLoadAttempt]),
        setCanvasContext: agentBridge?.setCanvasContext,
        projectId,
        media,
        title: currentProject?.name || t("canvas.project.untitledCanvas"),
        nodes,
        connections,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        generateNodeRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setViewport,
        setContextMenu,
    });

    const { pluginHost, renderPluginPanel, buildNodeToolbarItems } = usePluginHost({
        enabled: hostMode !== "mock",
        openConfigDialog,
        theme,
        nodesRef,
        connectionsRef,
        viewportRef,
        setNodes,
        setDialogNodeId,
        applyAgentOps,
    });
    const createNode = useCallback(
        (type: CanvasNodeTypeId, position?: Position) => {
            const targetPosition = position || getCanvasCenter();
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: effectiveConfig.imageModel || effectiveConfig.model,
                          size: effectiveConfig.size,
                          count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                      }
                    : undefined;
            const newNode = createCanvasNode(type, targetPosition, configMetadata);

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            const definition = getNodeDefinition(type);
            // Display-only plugin nodes with hidePanel do not open a panel; custom Panels require autoOpenPanel on creation.
            // Plugin nodes declaring useBuiltinPanel open the built-in generation panel on creation, like image nodes.
            // Built-in image, video, and config nodes retain their existing open-on-create behavior.
            const wantsPanel = definition?.hidePanel
                ? false
                : definition?.Panel
                  ? Boolean(definition.autoOpenPanel)
                  : definition?.useBuiltinPanel
                    ? true
                    : isBuiltinType(type) && type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Group;
            if (wantsPanel) setDialogNodeId(newNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, getCanvasCenter],
    );

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const allIds = new Set(ids);
            const removed = removeCanvasNodes(nodesRef.current, connectionsRef.current, allIds);
            nodesRef.current = removed.nodes;
            connectionsRef.current = removed.connections;
            setNodes(removed.nodes);
            setConnections(removed.connections);
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setReferencePickerNodeId((current) => (current && allIds.has(current) ? null : current));
            setExpandedBatchNodeIds((current) => new Set([...current].filter((nodeId) => !allIds.has(nodeId))));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: nodesRef.current.filter((node) => !allIds.has(node.id)), chatSessions }, "node-removed");
        },
        [chatSessions, cleanupCanvasFiles, projectId],
    );

    const groupSelection = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        const members = collectGroupMemberNodes(selectedIds, nodesRef.current);
        if (members.length < 2) return;
        const rect = getGroupWrapRect(members);
        const created = createCanvasNode(CanvasNodeType.Group, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        const result = applyGroupSelection(selectedIds, nodesRef.current, connectionsRef.current, { ...created, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height });
        if (!result) return;
        setNodes(result.nodes);
        setConnections(result.connections);
        setSelectedNodeIds(new Set(result.selectedIds));
        setSelectedConnectionId(null);
        setToolbarNodeId(result.selectedIds[0] || null);
        setDialogNodeId(null);
        setContextMenu(null);
    }, []);

    const ungroupSelection = useCallback((ids?: Set<string>) => {
        const result = applyUngroupSelection(ids || selectedNodeIdsRef.current, nodesRef.current, connectionsRef.current);
        if (!result) return;
        setNodes(result.nodes);
        setConnections(result.connections);
        setSelectedNodeIds(new Set(result.selectedIds));
        setSelectedConnectionId(null);
        setToolbarNodeId(result.selectedIds.length === 1 ? result.selectedIds[0] : null);
        setDialogNodeId(null);
        setContextMenu(null);
    }, []);

    const tidyCanvasLayout = useCallback(
        (ids?: Set<string>) => {
            const selected = ids || selectedNodeIdsRef.current;
            const positions = layoutCanvasNodes(nodesRef.current, connectionsRef.current, { selectedIds: selected.size ? selected : undefined });
            if (!positions.size) {
                message.info(t("canvas.projectPage.tidyNoNodes"));
                return;
            }
            const nextNodes = applyLayoutPositions(nodesRef.current, positions);
            nodesRef.current = nextNodes;
            setNodes(nextNodes);
            message.success(t("canvas.projectPage.tidySuccess", { count: positions.size }));
        },
        [message, t],
    );

    const deleteConnection = useCallback((connectionId: string) => {
        setConnections((prev) => removeCanvasConnection(prev, connectionId));
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, []);

    const disconnectNodeReference = useCallback((fromNodeId: string, toNodeId: string) => {
        setConnections((prev) => disconnectCanvasReference(prev, fromNodeId, toNodeId));
    }, []);

    const startNodeReferenceSelection = useCallback((nodeId: string) => {
        setReferencePickerNodeId(nodeId);
        setSelectedNodeIds(new Set([nodeId]));
        setSelectedConnectionId(null);
        setDialogNodeId(null);
    }, []);

    const exitNodeReferenceSelection = useCallback(() => {
        if (!referencePickerNodeId) return;
        setSelectedNodeIds(new Set([referencePickerNodeId]));
        setDialogNodeId(referencePickerNodeId);
        setReferencePickerNodeId(null);
    }, [referencePickerNodeId]);

    const selectNodeReference = useCallback(
        (fromNodeId: string) => {
            if (!referencePickerNodeId || referenceConnectedNodeIds.has(fromNodeId)) return;
            const source = nodesRef.current.find((node) => node.id === fromNodeId);
            if (!source || !isCanvasReferenceNode(source, nodesRef.current)) return;
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId, toNodeId: referencePickerNodeId }]);
        },
        [referenceConnectedNodeIds, referencePickerNodeId],
    );

    useEffect(() => {
        if (!referencePickerNodeId) return;
        const exit = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            exitNodeReferenceSelection();
        };
        window.addEventListener("keydown", exit, true);
        return () => window.removeEventListener("keydown", exit, true);
    }, [exitNodeReferenceSelection, referencePickerNodeId]);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, [cancelPendingConnectionCreate]);

    const clearCanvas = useCallback(() => {
        setNodes([]);
        setConnections([]);
        setInfoNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] }, "canvas-cleared");
    }, [cleanupCanvasFiles, deselectCanvas, projectId]);

    const duplicateNode = useCallback((nodeId: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        if (!source) return;

        const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const next = duplicateCanvasNode(source, id);

        setNodes((prev) => [...prev, next]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        if (next.type !== CanvasNodeType.Group) setDialogNodeId(id);
    }, []);

    const copySelectedNodes = useCallback(() => {
        clipboardRef.current = copyCanvasSelection(nodesRef.current, connectionsRef.current, selectedNodeIdsRef.current);
    }, []);

    const pasteCopiedNodes = useCallback(() => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;
        const pasted = pasteCanvasClipboard(clipboard, getCanvasCenter(), (node, index) => `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`, (_connection, index) => `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`);
        if (!pasted) return false;
        setNodes((prev) => [...prev, ...pasted.nodes]);
        setConnections((prev) => [...prev, ...pasted.connections]);
        setSelectedNodeIds(new Set(pasted.nodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(pasted.nodes[0]?.type === CanvasNodeType.Group ? null : pasted.nodes[0]?.id || null);
        return true;
    }, [getCanvasCenter]);

    useEffect(() => {
        if (hostMode !== "mock" || !projectReady || didInitialCenterRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (size.width !== rect.width || size.height !== rect.height) return;
        didInitialCenterRef.current = true;
        fitCanvasToNodes();
    }, [fitCanvasToNodes, hostMode, projectReady, size.height, size.width]);

    const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        applyingHistoryRef.current = true;
        setNodes(entry.nodes);
        setConnections(entry.connections);
        setChatSessions(entry.chatSessions);
        setActiveChatId(entry.activeChatId);
        setBackgroundMode(entry.backgroundMode);
        setShowImageInfo(entry.showImageInfo);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setTimeout(() => {
            lastHistoryRef.current = entry;
            applyingHistoryRef.current = false;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, []);

    const undoCanvas = useCallback(() => {
        const transition = moveCanvasHistory(historyRef.current, lastHistoryRef.current, "undo");
        if (!transition) return;
        historyRef.current = transition.stack;
        applyHistory(transition.snapshot);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const transition = moveCanvasHistory(historyRef.current, lastHistoryRef.current, "redo");
        if (!transition) return;
        historyRef.current = transition.stack;
        applyHistory(transition.snapshot);
    }, [applyHistory]);

    const createAndOpenProject = useCallback(async () => {
        try {
            const id = await createProject(t("canvas.defaultTitle", { count: projectSnapshot.projects.length + 1 }));
            navigate(`/canvas/${id}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建项目失败");
        }
    }, [createProject, message, navigate, projectSnapshot.projects.length, t]);

    const deleteCurrentProject = useCallback(async () => {
        try {
            await deleteProjects([projectId]);
            media.cleanup({ projectId, reason: "project-deleted" });
            navigate("/canvas");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除项目失败");
        }
    }, [media, deleteProjects, message, navigate, projectId]);

    const exportCurrentProject = useCallback(async () => {
        let hide: (() => void) | undefined;
        try {
            if (!exportProject) return message.info("当前宿主不支持导出项目");
            hide = message.loading(t("canvas.projectPage.exporting"), 0);
            await exportProject(projectId, currentProject?.name || t("canvas.title"));
            message.success(t("canvas.projectPage.exported"));
        } catch (error) {
            console.error(error);
            message.error(t("canvas.sidePanel.exportFailed"));
        } finally {
            hide?.();
        }
    }, [currentProject?.name, exportProject, message, projectId, t]);

    const exportCompletedResults = useCallback(async () => {
        setExportingResults(true);
        const hide = message.loading(t("canvas.sidePanel.exportingResults"), 0);
        try {
            const { exportedCount, skippedCount } = await exportCanvasResults(nodesRef.current, `${currentProject?.name || t("canvas.title")}-results`, projectId, (id, reference) => media.readMedia(id, reference, new AbortController().signal));
            if (skippedCount && exportedCount) message.warning(t("canvas.sidePanel.exportedResultsPartial", { exported: exportedCount, skipped: skippedCount }));
            else if (skippedCount) message.error(t("canvas.sidePanel.exportedResultsUnavailable", { count: skippedCount }));
            else if (exportedCount) message.success(t("canvas.sidePanel.exportedResults", { count: exportedCount }));
        } catch (error) {
            console.error(error);
            message.error(t("canvas.sidePanel.exportFailed"));
        } finally {
            hide();
            setExportingResults(false);
        }
    }, [currentProject?.name, media, message, projectId, t]);

    const restoreProjectVersion = useCallback(
        async (version: CanvasVersionDocument) => {
            if (imageImportScopeRef.current.signal.aborted) return;
            const hide = message.loading(t("canvas.versions.restoring"), 0);
            try {
                const restoredDocument = await restoreVersion(version);
                if (!restoredDocument) return;
                const { nodes: restoredNodes, connections: restoredConnections, viewport: restoredViewport } = restoredDocument;
                historyPausedRef.current = true;
                canvasVersionBaselineRef.current = { nodes: restoredNodes, connections: restoredConnections, backgroundMode: version.backgroundMode, showImageInfo: version.showImageInfo };
                setNodes(restoredNodes);
                setConnections(restoredConnections);
                setBackgroundMode(version.backgroundMode);
                setShowImageInfo(version.showImageInfo);
                setViewport(restoredViewport);
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                historyRef.current = { past: [], future: [] };
                lastHistoryRef.current = { nodes: restoredNodes, connections: restoredConnections, chatSessions, activeChatId, backgroundMode: version.backgroundMode, showImageInfo: version.showImageInfo };
                setHistoryState({ canUndo: false, canRedo: false });
                window.setTimeout(() => {
                    historyPausedRef.current = false;
                }, 0);
                setVersionsOpen(false);
                message.success(t("canvas.versions.restoredSuccess", { title: version.title }));
            } catch (error) {
                console.error(error);
                message.error(t("canvas.versions.restoreFailed"));
            }
            finally { hide(); }
        },
        [message, restoreVersion, t],
    );

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setContextMenu(null);
            setNodeCreatePosition(null);
            setHoveredNodeId(null);
            setToolbarNodeId(null);
            setDialogNodeId(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = createCanvasSelectionBox(world, event.shiftKey, selectedNodeIdsRef.current);
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                setSelectedNodeIds(new Set());
            }

            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, screenToCanvas],
    );

    const { handleNodeSelectCapture, handleNodeMouseDown, pendingSelectionRef } = nodeSelectionGesture;

    const finishNodeDrag = nodeDragGesture.finish;

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            if (nodeDragGesture.onMouseMove(event)) return;
            connectionGesture.onMouseMove(event);
        },
        [connectionGesture.onMouseMove, nodeDragGesture.onMouseMove],
    );

    const selectionGesture = useCanvasSelectionGesture({
        selectionBoxRef,
        nodesRef,
        screenToCanvas,
        setSelectionBox,
        setSelectedNodeIds,
    });

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);

            selectionGesture.clearSelectionGesture();
            connectionGesture.onMouseUp(event);
        },
        [connectionGesture.onMouseUp, finishNodeDrag, selectionGesture.clearSelectionGesture],
    );

    const handlePointerUp = useCallback((event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY), [finishNodeDrag]);
    const cancelNodeDrag = useCallback(() => finishNodeDrag(), [finishNodeDrag]);
    useCanvasWindowInteractionEvents({
        onMouseMove: handleGlobalMouseMove,
        onMouseUp: handleGlobalMouseUp,
        onPointerUp: handlePointerUp,
        onPointerCancel: cancelNodeDrag,
        onBlur: cancelNodeDrag,
        onPointerMove: selectionGesture.onPointerMove,
    });

    const handleImportedFileNode = useCallback((result: CanvasImportedFileNode) => {
        setNodes((prev) => [...prev, result.node]);
        setSelectedNodeIds(new Set([result.node.id]));
        setSelectedConnectionId(null);
        if (result.opensDetails) setDialogNodeId(result.node.id);
    }, []);
    const createFileImportId = useCallback((kind: CanvasFileKind) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, []);
    const reportFileImportFailure = useCallback((errorMessage: string) => message.error(errorMessage), [message]);
    const { importFileNode, importFileBatch, runImportPlan } = useCanvasFileImport({
        host: { projectId, mode: hostMode, importImage, importVideo, importAudio },
        scopeRef: imageImportScopeRef,
        createId: createFileImportId,
        onNodeImported: handleImportedFileNode,
        isCanceled: isGenerationCanceled,
        onFailure: reportFileImportFailure,
    });

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || t("canvas.projectPage.clipboardText"),
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter, t],
    );

    const pasteSystemClipboard = useCallback(async () => {
        const result = await pasteCanvasSystemClipboard(navigator.clipboard, {
            createImageFile: (file) => importFileNode(file, getCanvasCenter()),
            createTextNode: createTextNodeFromClipboard,
        });
        if (result === "image") message.success(t("canvas.projectPage.clipboardImageAdded"));
        if (result === "text") message.success(t("canvas.projectPage.clipboardTextAdded"));
    }, [createTextNodeFromClipboard, getCanvasCenter, importFileNode, message, t]);

    const getKeyboardShortcutState = useCallback(() => ({
        hasSelectedText: Boolean(window.getSelection()?.toString()),
        hasSelectedNodes: selectedNodeIdsRef.current.size > 0,
        hasSelectedConnection: Boolean(selectedConnectionId),
        canGroup: canGroupSelectedNodes(selectedNodeIdsRef.current, nodesRef.current),
        canUngroup: canUngroupSelectedNodes(selectedNodeIdsRef.current, nodesRef.current),
    }), [selectedConnectionId]);
    const handleKeyboardCommand = useCallback((command: CanvasKeyboardCommand) => {
        if (command === "undo") return void undoCanvas();
        if (command === "redo") return void redoCanvas();
        if (command === "select-all") {
            setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setSelectionBox(null);
            return;
        }
        if (command === "group") return void groupSelection();
        if (command === "ungroup") return void ungroupSelection();
        if (command === "copy") return void copySelectedNodes();
        if (command === "paste") {
            if (!pasteCopiedNodes()) void pasteSystemClipboard().catch((error: unknown) => message.error(error instanceof Error ? error.message : "粘贴失败"));
            return;
        }
        if (command === "delete-nodes") return void deleteNodes(new Set(selectedNodeIdsRef.current));
        if (command === "delete-connection") return void deleteConnection(selectedConnectionId!);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setNodeCreatePosition(null);
        setSelectionBox(null);
        setConnecting(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setInfoNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setPendingConnectionCreate(null);
    }, [copySelectedNodes, deleteConnection, deleteNodes, groupSelection, message, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, selectedConnectionId, setConnecting, undoCanvas, ungroupSelection]);
    useCanvasKeyboardShortcuts({ getState: getKeyboardShortcutState, onCommand: handleKeyboardCommand });

    const handleConnectStart = useCallback(
        (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target") => {
            event.stopPropagation();
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            setConnecting({ nodeId, handleType });
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [screenToCanvas, setConnecting],
    );

    const resetProjectInteraction = useCallback(() => {
        resetCanvasProjectInteraction({
            cancelPendingDragFrame: nodeDragGesture.cancelPendingFrame,
            cancelFocusAnimation,
            dragRef,
            selectionBoxRef,
            connectingParamsRef,
            connectionTargetNodeIdRef,
            pendingConnectionCreateRef,
            pendingSelectionRef,
            nodeDraggingRef,
            historyPausedRef,
            setRunningNodeId,
            setCropSaving,
            setMaskSaving,
            setSplitSaving,
            setUpscaleSaving,
            setSplitBatch,
            setIsNodeDragging,
            setIsNodeResizing,
            setSelectedNodeIds,
            setSelectedConnectionId,
            setConnectionTargetNodeId,
            setPendingConnectionCreate,
            setConnectingParams,
            setMouseWorld,
            setSelectionBox,
            setContextMenu,
            setNodeCreatePosition,
            setClearConfirmOpen,
            setHoveredNodeId,
            setToolbarNodeId,
            setDialogNodeId,
            setInfoNodeId,
            setCropNodeId,
            setMaskEditNodeId,
            setSplitNodeId,
            setUpscaleNodeId,
            setAngleNodeId,
            setPreviewNodeId,
            setPreviewImageId,
            setReferencePickerNodeId,
            setTitleEditing,
            setTitleDraft,
            setVersionsOpen,
            setAssetPickerOpen,
            setPluginManagerOpen,
            setExpandedBatchNodeIds,
            setDropTargetGroupId,
            setNodeImageSettingsOpen,
        });
    }, [cancelFocusAnimation, nodeDragGesture.cancelPendingFrame]);
    useCanvasProjectInteractionReset(projectId, resetProjectInteraction);

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((prev) => resizeCanvasNode(prev, nodeId, width, height, position));
    }, []);

    const handleNodeResizeStart = useCallback(() => {
        setIsNodeResizing(true);
    }, []);
    const handleNodeResizeEnd = useCallback(() => setIsNodeResizing(false), []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) => toggleCanvasNodeFreeResize(prev, nodeId));
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) => updateCanvasNodeContent(prev, nodeId, content));
    }, []);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        setNodes((prev) => updateCanvasNodeTitle(prev, nodeId, title));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        setExpandedBatchNodeIds((current) => {
            const next = new Set(current);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    const setBatchPrimary = useCallback((nodeId: string, itemId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                return node.id === nodeId ? setCanvasBatchPrimary(node, itemId) : node;
            }),
        );
    }, []);

    const duplicateBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
        const id = nanoid();
        const copy = createCanvasBatchImageCopy(node, imageId, id);
        if (!copy) return;
        setNodes((prev) => [...prev, copy]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => updateCanvasNodePrompt(prev, nodeId, prompt));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeMetadata>) => {
        setNodes((prev) => applyCanvasNodeConfigPatch(prev, nodeId, patch));
    }, []);

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        saveAs(node.metadata.content, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`);
    }, []);

    const downloadBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
        const image = node.metadata?.images?.find((item) => item.id === imageId);
        if (!image?.content) return;
        saveAs(image.content, `canvas-image-${node.id}-${image.id}.${imageExtension(image.content)}`);
    }, []);

    const captureVideoNodeFrame = useCallback(
        async (nodeId: string, position: VideoFramePosition) => {
            setContextMenu(null);
            const node = nodesRef.current.find((item) => item.id === nodeId);
            const video = Array.from(containerRef.current?.querySelectorAll<HTMLVideoElement>("video[data-canvas-video]") || []).find((item) => item.dataset.canvasVideo === nodeId);
            if (node?.type !== CanvasNodeType.Video || !node.metadata?.content || !video) return message.error(t("canvas.videoFrames.failed"));
            const signal = imageImportScopeRef.current.signal;
            try {
                const frame = await captureVideoFrame(node.metadata.content, position, video.currentTime, signal);
                const image = await saveResultImage(frame, `canvas-${node.id}-${position}.png`, signal);
                if (!nodesRef.current.some((item) => item.id === node.id)) return;
                const size = fitNodeSize(image.width, image.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const id = nanoid();
                const x = node.position.x + node.width + 96;
                let y = node.position.y + node.height / 2 - size.height / 2;
                while (nodesRef.current.some((item) => item.id !== node.id && item.position.x < x + size.width && item.position.x + item.width > x && item.position.y < y + size.height && item.position.y + item.height > y)) y += size.height + 24;
                const child: CanvasNodeData = {
                    id,
                    type: CanvasNodeType.Image,
                    title: t(`canvas.videoFrames.${position}Title`, { name: node.title || t("assets.kinds.video") }),
                    position: { x, y },
                    ...size,
                    metadata: canvasAssetMetadata(image),
                };
                setNodes((prev) => [...prev, child]);
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: id }]);
                setSelectedNodeIds(new Set([id]));
                setSelectedConnectionId(null);
                setDialogNodeId(id);
                message.success(t("canvas.videoFrames.captured"));
            } catch {
                if (signal.aborted) return;
                message.error(t("canvas.videoFrames.failed"));
            }
        },
        [message, saveResultImage, t],
    );

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (!addToUserAssets) return message.error("当前宿主不支持保存到我的素材");
            const asset = createCanvasUserAsset(node, { text: t("canvas.projectPage.canvasText"), image: t("canvas.projectPage.canvasImage"), video: t("canvas.projectPage.canvasVideo") });
            if (!asset) return message.error(t(node.type === CanvasNodeType.Text ? "canvas.projectPage.noTextToSave" : node.type === CanvasNodeType.Video ? "canvas.projectPage.noVideoToSave" : "canvas.projectPage.noImageToSave"));
            addToUserAssets(asset);
            message.success(t("common.addedToAssets"));
        },
        [addToUserAssets, message, t],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning(t("canvas.projectPage.emptyReverse"));
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(
                    CanvasNodeType.Text,
                    { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY },
                    { content: t("canvas.projectPage.reversePreset"), prompt: t("canvas.projectPage.reversePreset"), status: NODE_STATUS_SUCCESS, fontSize: 14 },
                ),
                title: t("canvas.projectPage.reverseTitle"),
            };
            const configNode = {
                ...createCanvasNode(
                    CanvasNodeType.Config,
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultCanvasGenerationPreferences.textModel,
                        count: 1,
                        composerContent: t("canvas.reverseComposer", { imageId: node.id, textId: textNode.id }),
                    },
                ),
                title: t("canvas.projectPage.reverseConfigTitle"),
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id }, { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id }]);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message, t],
    );

    const handleImageDerivativeCreated = useCallback((kind: CanvasImageDerivativeKind, source: CanvasNodeData, child: CanvasNodeData) => {
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: source.id, toNodeId: child.id }]);
        setSelectedNodeIds(new Set([child.id]));
        if (kind === "upscale") setSelectedConnectionId(null);
        setDialogNodeId(child.id);
        if (kind === "crop") setCropNodeId(null);
        else setUpscaleNodeId(null);
    }, []);
    const handleImageDerivativeSourceMissing = useCallback((kind: CanvasImageDerivativeKind) => {
        const labels = { crop: "裁剪结果", upscale: "放大结果" };
        message.info(`源节点已移除，${labels[kind]}已保存在项目素材中`);
        if (kind === "upscale") setUpscaleNodeId(null);
    }, [message]);
    const handleImageDerivativeBusyChange = useCallback((kind: CanvasImageDerivativeKind, busy: boolean) => {
        if (kind === "crop") setCropSaving(busy);
        else setUpscaleSaving(busy);
    }, []);
    const handleImageDerivativeError = useCallback((kind: CanvasImageDerivativeKind, error: unknown) => {
        const fallback = kind === "crop" ? "裁剪保存失败" : "放大保存失败";
        message.error(error instanceof Error ? error.message : fallback);
    }, [message]);
    const { cropImageNode, upscaleImageNode } = useCanvasImageDerivativeActions({
        importImage,
        projectId,
        cropRequest: cropRequestRef,
        upscaleRequest: upscaleRequestRef,
        isSourcePresent: (nodeId) => nodesRef.current.some((item) => item.id === nodeId),
        onCreated: handleImageDerivativeCreated,
        onSourceMissing: handleImageDerivativeSourceMissing,
        onBusyChange: handleImageDerivativeBusyChange,
        onError: handleImageDerivativeError,
    });

    const handleImageSplitSaved = useCallback((source: CanvasNodeData, previous: CanvasSplitBatch, result: CanvasSplitBatch) => {
        const { newNodes: childNodes, complete } = resolveCanvasSplitWriteback(previous, result);
        setSplitBatch(result);
        if (childNodes.length) {
            setNodes((prev) => [...prev, ...childNodes]);
            setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: source.id, toNodeId: child.id }))]);
            setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
        }
        if (complete) {
            setSplitNodeId(null);
            setSplitBatch(null);
            message.success(t("canvas.projectPage.splitSuccess", { count: result.items.length }));
        } else message.warning("部分切片保存失败，成功项已保留，可重试失败片");
    }, [message, t]);
    const handleImageSplitSourceMissing = useCallback(() => {
        message.info("源节点已移除，成功切片保留在项目素材中");
        setSplitNodeId(null);
        setSplitBatch(null);
    }, [message]);
    const handleImageSplitError = useCallback((error: unknown) => {
        message.error(error instanceof Error ? error.message : "切图保存失败");
    }, [message]);
    const splitImageNode = useCanvasImageSplitActions({
        importImage,
        projectId,
        splitRequest: splitRequestRef,
        splitBatch,
        isSourcePresent: (nodeId) => nodesRef.current.some((item) => item.id === nodeId),
        onSaved: handleImageSplitSaved,
        onSourceMissing: handleImageSplitSourceMissing,
        onBusyChange: setSplitSaving,
        onError: handleImageSplitError,
    });

    const handleMaskSourceMissing = useCallback(() => {
        message.info("源节点已移除，蒙版已保存在项目素材中");
    }, [message]);
    const handleMaskAssetError = useCallback((error: unknown) => {
        message.error(error instanceof Error ? error.message : t("canvas.projectPage.maskFailed"));
    }, [message, t]);
    const createMaskAsset = useCanvasMaskAssetActions({
        importImage,
        projectId,
        maskRequest: maskRequestRef,
        isSourcePresent: (nodeId) => nodesRef.current.some((item) => item.id === nodeId),
        onSourceMissing: handleMaskSourceMissing,
        onBusyChange: setMaskSaving,
        onError: handleMaskAssetError,
    });
    const handleImageEditSettled = useCallback((targetNodeId: string) => {
        setRunningNodeId((current) => current === targetNodeId ? null : current);
    }, []);
    const submitNodeTaskCommand = useCallback((input: SubmitCanvasTask, targetNodeId: string, title: string, signal: AbortSignal) => submitCanvasNodeTask({
        taskExecution,
        onTaskRecordChange,
        updateNodes: (updater) => setNodes(updater),
        input,
        targetNodeId,
        title,
        signal,
    }), [onTaskRecordChange, taskExecution]);
    const submitNodeTask = taskExecution ? submitNodeTaskCommand : undefined;
    const runCanvasImageEdit = useCanvasImageEditExecution({
        projectId,
        media,
        generation: imageGeneration,
        submitNodeTask,
        saveResultImage,
        startRequest: startGenerationRequest,
        finishRequest: finishGenerationRequest,
        isCanceled: isGenerationCanceled,
        onSettled: handleImageEditSettled,
    });

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content || maskRequestRef.current) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
            if (payload.generate && !(taskExecution && node.metadata?.assetId) && !isAiConfigReady(generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = t("canvas.projectPage.maskPrompt", { source: imageReferenceLabel(0), mask: imageReferenceLabel(1), prompt: userPrompt });
            const maskNode = await createMaskAsset(node, payload.maskDataUrl, t("canvas.projectPage.maskNodeTitle"));
            if (!maskNode) return;
            setMaskEditNodeId(null);
            const maskNodeId = maskNode.id;
            if (!payload.generate) {
                setNodes((prev) => [...prev, maskNode]);
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: maskNodeId }]);
                setSelectedNodeIds(new Set([maskNodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(maskNodeId);
                return;
            }
            const childId = nanoid();
            const plan = createCanvasMaskEditPlan({ source: node, mask: maskNode, childId, title: userPrompt.slice(0, 32) || t("canvas.projectPage.maskResult"), prompt, buildGenerationMetadata: (references) => buildImageGenerationMetadata("edit", generationConfig, 1, references), generate: true });
            if (!plan) return;
            const generationMetadata = plan.generationMetadata;
            const childNode = plan.node;
            setNodes((prev) => [
                ...prev,
                maskNode,
                childNode,
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }, { id: nanoid(), fromNodeId: maskNodeId, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            setRunningNodeId(childId);
            await runCanvasImageEdit({
                targetNodeId: childId,
                originNodeId: node.id,
                prompt,
                settings: generationConfig,
                references: plan.references,
                sourceVersionId: node.metadata?.versionId,
                fallbackMessage: t("canvas.projectPage.maskFailed"),
                onSuccess: (uploaded) => {
                setNodes((prev) => applyCanvasImageEditAction(prev, { kind: "succeeded", result: { nodeId: childId, uploadedImage: uploaded, defaultImageSize: { width: node.width, height: node.height }, prompt, generationMetadata } }));
                },
                onFailure: (errorDetails) => {
                message.error(errorDetails);
                setNodes((prev) => applyCanvasImageEditAction(prev, { kind: "failed", failure: { nodeId: childId, errorDetails } }));
                },
            });
        },
        [createMaskAsset, effectiveConfig, isAiConfigReady, message, openConfigDialog, runCanvasImageEdit, taskExecution, t],
    );

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!(taskExecution && node.metadata?.assetId) && !isAiConfigReady(generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const plan = createCanvasAngleEditPlan({ source: node, childId, title, prompt, buildGenerationMetadata: (references) => buildImageGenerationMetadata("edit", generationConfig, 1, references), size: imageConfig });
            if (!plan) return;
            const generationMetadata = plan.generationMetadata;
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                plan.node,
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            await runCanvasImageEdit({
                targetNodeId: childId,
                originNodeId: node.id,
                prompt,
                settings: generationConfig,
                references: plan.references,
                sourceVersionId: node.metadata?.versionId,
                fallbackMessage: t("canvas.projectPage.generationFailed"),
                onSuccess: (uploaded) => {
                setNodes((prev) => applyCanvasImageEditAction(prev, { kind: "succeeded", result: { nodeId: childId, uploadedImage: uploaded, defaultImageSize: { width: imageConfig.width, height: imageConfig.height }, prompt, generationMetadata } }));
                },
                onFailure: (errorDetails) => {
                setNodes((prev) => applyCanvasImageEditAction(prev, { kind: "failed", failure: { nodeId: childId, errorDetails } }));
                },
            });
        },
        [effectiveConfig, isAiConfigReady, openConfigDialog, runCanvasImageEdit, taskExecution, t],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => updateCanvasNodeFontSize(prev, nodeId, fontSize));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        const node = nodeId ? nodes.find((candidate) => candidate.id === nodeId) : undefined;
        const kind = node?.type === CanvasNodeType.Image
            ? "image"
            : node?.type === CanvasNodeType.Video
                ? "video"
                : node?.type === CanvasNodeType.Audio
                    ? "audio"
                    : undefined;
        uploadTargetRef.current = { nodeId, position, kind };
        const input = imageInputRef.current;
        if (!input) return;
        input.accept = kind === "image"
            ? "image/*"
            : kind === "video"
                ? "video/*"
                : kind === "audio"
                    ? "audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
                    : ["image/*", importVideo ? "video/*" : "", importAudio ? "audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" : ""].filter(Boolean).join(",");
        input.click();
    }, [importAudio, importVideo, nodes]);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const files = filterCanvasImportFiles(event.target.files || []);
            const target = uploadTargetRef.current;
            const targetKind = target?.kind;
            uploadTargetRef.current = null;
            event.target.value = "";
            if (!files.length) return;
            if (targetKind) {
                const hasMismatch = files.some((file) => !matchesCanvasFileKind(file, targetKind));
                if (hasMismatch) {
                    const kindLabel = targetKind === "image" ? "图片" : targetKind === "video" ? "视频" : "音频";
                    message.error(`该节点仅支持上传${kindLabel}文件`);
                    return;
                }
            }
            const basePosition = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const plan = createCanvasImportPlan(files, basePosition, target?.nodeId);
            if (!plan) return;
            await runImportPlan(
                plan,
                (replacement) => {
                    if (replacement.status === "fulfilled") {
                        const { nodeId, file, value } = replacement;
                        setNodes((prev) => replaceCanvasNodeInList(prev, nodeId, file.name, value));
                        setSelectedNodeIds(new Set([nodeId]));
                        setSelectedConnectionId(null);
                    } else if (!isGenerationCanceled(replacement.reason)) {
                        message.error(`${replacement.file.name}：${replacement.reason instanceof Error ? replacement.reason.message : "素材替换失败"}`);
                    }
                },
            );
        },
        [message, projectId, runImportPlan, screenToCanvas, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const draggedAsset = parseCanvasAssetDragData(event.dataTransfer.getData(CANVAS_ASSET_DRAG_MIME));
            if (draggedAsset) {
                if (draggedAsset.projectId !== projectId) return;
                const position = screenToCanvas(event.clientX, event.clientY);
                void assetLibrary.list().then((sources) => {
                    const item = sources.flatMap((source) => source.items).find((candidate) => candidate.id === draggedAsset.assetId && candidate.payload.kind !== "text" && candidate.payload.asset?.projectId === projectId);
                    const asset = item && item.payload.kind !== "text" ? item.payload.asset : undefined;
                    if (!asset || asset.projectId !== projectId) throw new Error("素材不属于当前项目");
                    insertProjectAssetRef.current?.({ requestId: nanoid(), asset, position });
                }).catch((error: unknown) => message.error(error instanceof Error ? error.message : "素材插入失败"));
                return;
            }
            const files = filterCanvasImportFiles(event.dataTransfer.files);
            if (!files.length) return;

            const basePos = screenToCanvas(event.clientX, event.clientY);
            const plan = createCanvasImportPlan(files, basePos);
            if (plan) void importFileBatch(plan.items);
        },
        [assetLibrary, importFileBatch, message, projectId, screenToCanvas],
    );

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.name || t("canvas.projectPage.untitledCanvas"));
        setTitleEditing(true);
    }, [currentProject?.name, t]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) void renameProject(projectId, nextTitle).catch((error: unknown) => message.error(error instanceof Error ? error.message : "重命名失败"));
        setTitleEditing(false);
    }, [message, projectId, renameProject, titleDraft]);

    const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        event.preventDefault();
        setContextMenu(null);
    }, []);

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => {
            if ((mode === "video" && !importVideo) || (mode === "audio" && !importAudio)) {
                message.error(mode === "video" ? "当前宿主不支持视频导入" : "当前宿主不支持音频导入");
                return;
            }
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            const builtinPanel = sourceNode ? getNodeDefinition(sourceNode.type)?.useBuiltinPanel : undefined;
            if (!(mode === "image" && taskExecution && !builtinPanel?.writeBackToSelf) && !isAiConfigReady(generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            // useBuiltinPanel.writeBackToSelf reuses built-in generation while writing the result back to the plugin node.
            // Image mode currently supports display-only nodes such as panoramas, with a useBuiltinPanel.promptPrefix.
            if (sourceNode && builtinPanel?.writeBackToSelf && builtinPanel.mode === "image") {
                const scene = prompt.trim();
                if (!scene) return;
                setRunningNodeId(nodeId);
                const controller = startGenerationRequest(nodeId, nodeId, nodeId);
                setNodes((prev) => applyCanvasGenerationStart(prev, { nodeId, prompt: scene }));
                try {
                    const uploaded = await executeCanvasImageWriteback({
                        projectId,
                        nodeId,
                        scene,
                        promptPrefix: builtinPanel.promptPrefix,
                        nodes: nodesRef.current,
                        connections: connectionsRef.current,
                        settings: generationConfig,
                        media,
                        generation: imageGeneration,
                        saveResultImage,
                        signal: controller.signal,
                    });
                    setNodes((prev) => applyCanvasImageWritebackResult(prev, { nodeId, uploadedImage: uploaded, prompt: scene, model: generationConfig.model }));
                    setDialogNodeId(null);
                } catch (error) {
                    const outcome = resolveCanvasGenerationOutcome(error, controller.signal, t("canvas.projectPage.generationFailed"), isGenerationCanceled);
                    if (outcome.kind === "failed") {
                        const errorDetails = outcome.message;
                        message.error(errorDetails);
                        setNodes((prev) => markCanvasNodeError(prev, nodeId, errorDetails));
                    }
                } finally {
                    finishGenerationRequest(nodeId, controller);
                    if (!controller.signal.aborted) setRunningNodeId((current) => current === nodeId ? null : current);
                }
                return;
            }

            setRunningNodeId(nodeId);
            const runController = startGenerationRequest(nodeId, nodeId, nodeId);
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
            let pendingChildIds: string[] = [];
            try {
                const generationContext = await hydrateNodeGenerationContext(
                    buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, editingTextNode ? t("canvas.projectPage.editTextPrompt", { source: sourceTextContent, prompt }) : prompt),
                    media, projectId, runController.signal,
                );
                const effectivePrompt = generationContext.prompt.trim();
                if (!effectivePrompt && (mode === "text" || mode === "audio")) return;
                if (mode !== "image" && !isAiConfigReady(generationConfig.model)) {
                    openConfigDialog(true);
                    return;
                }
                if (markSourceStatus && mode !== "image")
                    setNodes((prev) => applyCanvasGenerationStart(prev, { nodeId, prompt }));
                if (mode === "image") {
                    const count = getGenerationCount(generationConfig.count);
                    const sourceReference = await readCanvasReferenceImages(media, projectId, sourceNodeReferenceImages(sourceNode || null), runController.signal);
                    const referenceImages = [...new Map([...sourceReference, ...generationContext.referenceImages].map((image) => [image.id, image])).values()];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const plan = createCanvasImageGenerationPlan({
                        nodeId,
                        sourceNode,
                        prompt: effectivePrompt,
                        config: generationConfig,
                        count,
                        references: referenceImages,
                        sizes: {
                            config: NODE_DEFAULT_SIZE[CanvasNodeType.Config],
                            image: imageConfig,
                            text: NODE_DEFAULT_SIZE[CanvasNodeType.Text],
                        },
                        createId: nanoid,
                    });
                    const { rootId, imageIds, isConfigNode, isEmptyImageNode } = plan;
                    const submitAsTask = Boolean(taskExecution && imageIds.length === 1 && referenceImages.length === 0 && sourceNode?.type !== CanvasNodeType.Image);
                    if (!submitAsTask && !isAiConfigReady(generationConfig.model)) {
                        openConfigDialog(true);
                        return;
                    }
                    if (markSourceStatus) setNodes((prev) => applyCanvasGenerationStart(prev, { nodeId, prompt }));
                    pendingChildIds = [rootId];
                    setNodes((prev) => applyCanvasImageGenerationPlan(prev, plan, prompt));
                    if (!isEmptyImageNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]);
                    setSelectedNodeIds(new Set([nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(nodeId);

                    const controller = rootId === nodeId ? runController : startGenerationRequest(rootId, nodeId, nodeId, runController);
                    if (submitAsTask && submitNodeTask) {
                        try {
                            await submitNodeTask({
                                projectId,
                                type: "GENERATE",
                                prompt: effectivePrompt,
                                image: { model: generationConfig.model, quality: generationConfig.quality, size: generationConfig.size, background: generationConfig.background },
                            }, rootId, "图片生成任务", controller.signal);
                            if (controller.signal.aborted) return;
                        } finally {
                            if (rootId !== nodeId) finishGenerationRequest(rootId, controller);
                        }
                        return;
                    }
                    const attempts = await Promise.all(
                        imageIds.map(async (imageId) => {
                            const attempt = await executeCanvasBatchImageAttempt({
                                projectId,
                                generation: imageGeneration,
                                saveResultImage,
                                imageId,
                                prompt: effectivePrompt,
                                settings: generationConfig,
                                references: referenceImages,
                                signal: controller.signal,
                                isCanceled: isGenerationCanceled,
                                fallbackMessage: t("canvas.projectPage.generationFailed"),
                            });
                            if (attempt.status === "succeeded") {
                                setNodes((prev) => applyCanvasBatchImageAttemptResult(prev, {
                                    rootNodeId: rootId,
                                    imageId,
                                    configNodeId: isConfigNode ? nodeId : undefined,
                                    defaultImageSize: { width: imageConfig.width, height: imageConfig.height },
                                    attempt,
                                }));
                                return { status: "succeeded" as const };
                            }
                            if (attempt.status === "failed") {
                                const { errorDetails } = attempt;
                                setNodes((prev) => applyCanvasBatchImageAttemptResult(prev, {
                                    rootNodeId: rootId,
                                    imageId,
                                    defaultImageSize: { width: imageConfig.width, height: imageConfig.height },
                                    attempt,
                                }));
                                return { status: "failed" as const, errorDetails };
                            }
                            return { status: "canceled" as const };
                        }),
                    );
                    const batchSummary = summarizeCanvasGenerationBatch(attempts);
                    if (rootId !== nodeId) finishGenerationRequest(rootId, controller);
                    if (controller.signal.aborted) return;
                    if (batchSummary.hasFailure) {
                        message.error(batchSummary.hasSuccess ? t("canvas.projectPage.partialFailed") : batchSummary.firstError || t("canvas.projectPage.generationFailed"));
                    }
                    setNodes((prev) => applyCanvasBatchImageSummary(prev, {
                        sourceNodeId: nodeId,
                        rootNodeId: rootId,
                        configNodeId: isConfigNode ? nodeId : undefined,
                        hasSuccess: batchSummary.hasSuccess,
                        failureMessage: t("canvas.projectPage.generationFailed"),
                        allFailedMessage: t("canvas.projectPage.allFailed"),
                    }));
                    return;
                }

                if (mode === "video") {
                    const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const videoPlan = createCanvasGeneratedMediaPlan({ nodeId, sourceNode, type: CanvasNodeType.Video, prompt: effectivePrompt, size: spec, metadata: buildCanvasVideoGenerationMetadata(generationConfig, generationReferenceUrls(generationContext)), createId: nanoid });
                    const videoId = videoPlan.nodeId;
                    pendingChildIds = [videoId];
                    setNodes((prev) => applyCanvasGeneratedMediaPlan(prev, videoPlan));
                    if (!videoPlan.reusesSource) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }]);
                    const controller = startGenerationRequest(videoId, nodeId, nodeId, runController);
                    try {
                        await completeVideoNodeTask(
                            videoId,
                            generationConfig,
                            effectivePrompt,
                            generationContext.referenceImages,
                            controller.signal,
                            buildCanvasVideoGenerationMetadata(generationConfig, generationReferenceUrls(generationContext)),
                            generationContext.referenceVideos,
                            generationContext.referenceAudios,
                        );
                    } finally {
                        finishGenerationRequest(videoId, controller);
                    }
                    return;
                }

                if (mode === "audio") {
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const audioPlan = createCanvasGeneratedMediaPlan({ nodeId, sourceNode, type: CanvasNodeType.Audio, prompt: effectivePrompt, size: spec, metadata: buildCanvasAudioGenerationMetadata(generationConfig), createId: nanoid });
                    const audioId = audioPlan.nodeId;
                    pendingChildIds = [audioId];
                    setNodes((prev) => applyCanvasGeneratedMediaPlan(prev, audioPlan));
                    if (!audioPlan.reusesSource) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
                    const controller = startGenerationRequest(audioId, nodeId, nodeId, runController);
                    try {
                        const audio = await executeCanvasAudioTask({ projectId, prompt: effectivePrompt, settings: buildCanvasAudioSettings(generationConfig), signal: controller.signal, generation: audioGeneration, importAudio, name: `canvas-${audioId}.${generationConfig.audioFormat}` });
                        setNodes((prev) => prev.map((node) => node.id === audioId ? applyCanvasAudioResult(node, audio, { prompt: effectivePrompt, ...buildCanvasAudioGenerationMetadata(generationConfig) }) : node));
                    } finally {
                        finishGenerationRequest(audioId, controller);
                    }
                    return;
                }

                const textCount = getGenerationCount(String(sourceNode?.metadata?.textCount || 1));
                const textPlan = createCanvasTextGenerationPlan({ nodeId, sourceNode, reuseSource: !sourceTextContent, prompt: effectivePrompt, config: generationConfig, textCount, sizes: { config: NODE_DEFAULT_SIZE[CanvasNodeType.Config], text: NODE_DEFAULT_SIZE[CanvasNodeType.Text] }, createId: nanoid });
                const { rootId, textIds, isConfigNode, isEmptyTextNode } = textPlan;
                pendingChildIds = [rootId];
                setNodes((prev) => applyCanvasTextGenerationPlan(prev, textPlan));
                if (!isEmptyTextNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]);
                setSelectedNodeIds(new Set([nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(nodeId);

                const controller = rootId === nodeId ? runController : startGenerationRequest(rootId, nodeId, nodeId, runController);
                const results = await Promise.all(
                    textIds.map(async (textId): Promise<CanvasNodeText | null> => {
                        let streamed = "";
                        try {
                            if (!textGeneration) throw new Error("当前宿主不支持文本生成");
                            const answer = await textGeneration.execute(
                                { model: generationConfig.model, reasoningEffort: generationConfig.reasoningEffort, messages: buildNodeResponseMessages({ ...generationContext, prompt: effectivePrompt }), onDelta: (text) => {
                                    streamed = text;
                                    setNodes((prev) => applyCanvasTextDelta(prev, rootId, textId, text));
                                } },
                                controller.signal,
                            );
                            const content = answer.text || streamed;
                            const result = { id: textId, status: NODE_STATUS_SUCCESS, content } satisfies CanvasNodeText;
                            setNodes((prev) => applyCanvasTextResult(prev, rootId, result));
                            return result;
                        } catch (error) {
                            if (isGenerationCanceled(error)) return null;
                            const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                            const result = { id: textId, status: NODE_STATUS_ERROR, content: "", errorDetails } satisfies CanvasNodeText;
                            setNodes((prev) => applyCanvasTextResult(prev, rootId, result));
                            return result;
                        }
                    }),
                );
                if (rootId !== nodeId) finishGenerationRequest(rootId, controller);
                if (controller.signal.aborted) return;
                const summary = summarizeCanvasTextBatch(results);
                if (summary.completedTexts.length <= 1) setExpandedBatchNodeIds((current) => new Set([...current].filter((id) => id !== rootId)));
                if (summary.failedTexts.length) message.error(summary.firstText ? t("canvas.projectPage.partialTextFailed") : summary.failedTexts[0]?.errorDetails || t("canvas.projectPage.generationFailed"));
                setNodes((prev) => applyCanvasTextBatchSummary(prev, {
                    rootNodeId: rootId,
                    configNodeId: isConfigNode ? nodeId : undefined,
                    summary,
                    partialFailureMessage: t("canvas.projectPage.partialTextFailed"),
                    generationFailureMessage: t("canvas.projectPage.generationFailed"),
                }));
            } catch (error) {
                const outcome = resolveCanvasGenerationFailure(error, runController.signal, t("canvas.projectPage.generationFailed"), isGenerationCanceled);
                if (outcome.kind === "canceled") return;
                const errorDetails = outcome.message;
                message.error(errorDetails);
                setNodes((prev) => applyCanvasGenerationTargetsFailure(prev, { nodeIds: [nodeId, ...pendingChildIds], skipNodeId: !markSourceStatus ? nodeId : undefined, errorDetails, videoTimedOut: outcome.videoTimedOut, videoTaskFailed: outcome.videoTaskFailed }));
            } finally {
                finishGenerationRequest(nodeId, runController);
                if (!runController.signal.aborted) setRunningNodeId(null);
            }
        },
        [audioGeneration, completeVideoNodeTask, effectiveConfig, finishGenerationRequest, imageGeneration, importAudio, importVideo, isAiConfigReady, media, message, openConfigDialog, projectId, saveResultImage, startGenerationRequest, submitNodeTask, t, taskExecution, textGeneration],
    );
    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData, imageId?: string) => {
            if (hasVideoTaskReference(node)) {
                await pollVideoNodeTask(node);
                return;
            }
            if ((node.type === CanvasNodeType.Video && !importVideo) || (node.type === CanvasNodeType.Audio && !importAudio)) {
                message.error(node.type === CanvasNodeType.Video ? "当前宿主不支持视频导入" : "当前宿主不支持音频导入");
                return;
            }
            const retryPlan = createCanvasRetryPlan({ node, nodes: nodesRef.current, connections: connectionsRef.current, preferences: effectiveConfig });
            const { sourceNode, savedImageMetadata, generationConfig } = retryPlan;
            if (!isAiConfigReady(generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            setRunningNodeId(node.id);
            const controller = startGenerationRequest(node.id, sourceNode.id, node.id);
            try {
                const preparation = await prepareCanvasRetry({ plan: retryPlan, nodes: nodesRef.current, connections: connectionsRef.current, media, projectId, signal: controller.signal });
                const { context, prompt, useReferenceImages, savedReferences } = preparation;
                if (!prompt) {
                    message.warning(t("canvas.projectPage.retryPromptMissing"));
                    return;
                }
                if (useReferenceImages && !savedReferences) throw new Error(t("canvas.projectPage.referenceMissing"));
                const retryImages = await readCanvasRetryReferences({ plan: retryPlan, preparation, media, projectId, signal: controller.signal });
                controller.signal.throwIfAborted();
                if (!nodesRef.current.some((item) => item.id === node.id)) return;
                setNodes((prev) => applyCanvasGenerationStart(prev, { nodeId: node.id, imageId }));
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    let streamed = "";
                    if (!textGeneration) throw new Error("当前宿主不支持文本生成");
                    const answer = await textGeneration.execute(
                        { model: generationConfig.model, reasoningEffort: generationConfig.reasoningEffort, messages: buildNodeResponseMessages({ ...context, prompt }), onDelta: (text) => {
                            streamed = text;
                                    setNodes((prev) => applyCanvasTextNodeDelta(prev, node.id, text));
                        } },
                        controller.signal,
                    );
                    setNodes((prev) => applyCanvasTextNodeResult(prev, node.id, answer.text || streamed, prompt));
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    await completeVideoNodeTask(
                        node.id,
                        generationConfig,
                        prompt,
                        retryImages,
                        controller.signal,
                        buildCanvasVideoGenerationMetadata(generationConfig),
                        context?.referenceVideos || [],
                        context?.referenceAudios || [],
                    );
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const audio = await executeCanvasAudioTask({ projectId, prompt, settings: buildCanvasAudioSettings(generationConfig), signal: controller.signal, generation: audioGeneration, importAudio, name: `canvas-${node.id}.${generationConfig.audioFormat}` });
                    setNodes((prev) => prev.map((item) => item.id === node.id ? applyCanvasAudioResult(item, audio, { prompt, ...buildCanvasAudioGenerationMetadata(generationConfig) }) : item));
                    return;
                }

                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const retryResult = await executeCanvasImageRetry({
                    projectId,
                    generation: imageGeneration,
                    saveResultImage,
                    node,
                    savedMetadata: savedImageMetadata,
                    imageId,
                    prompt,
                    settings: generationConfig,
                    useReferenceImages,
                    references: retryImages,
                    signal: controller.signal,
                    defaultImageSize: { width: imageConfig.width, height: imageConfig.height },
                });
                setNodes((prev) => applyCanvasRetryImageResult(prev, retryResult));
            } catch (error) {
                const outcome = resolveCanvasGenerationFailure(error, controller.signal, t("canvas.projectPage.generationFailed"), isGenerationCanceled);
                if (outcome.kind === "canceled") return;
                const errorDetails = outcome.message;
                message.error(errorDetails);
                setNodes((prev) => applyCanvasGenerationFailure(prev, { nodeId: node.id, errorDetails, imageId, videoTimedOut: outcome.videoTimedOut, videoTaskFailed: outcome.videoTaskFailed }));
            } finally {
                finishGenerationRequest(node.id, controller);
                if (!controller.signal.aborted) setRunningNodeId(null);
            }
        },
        [audioGeneration, completeVideoNodeTask, effectiveConfig, finishGenerationRequest, imageGeneration, importAudio, importVideo, isAiConfigReady, media, message, openConfigDialog, pollVideoNodeTask, projectId, saveResultImage, startGenerationRequest, t, textGeneration],
    );

    const deleteBatchImage = useCallback((nodeId: string, imageId: string) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if ((node?.metadata?.images?.length || 0) <= 2) setExpandedBatchNodeIds((current) => new Set([...current].filter((id) => id !== nodeId)));
        setNodes((prev) => deleteCanvasBatchImage(prev, nodeId, imageId));
    }, []);

    const retryBatchImage = useCallback((node: CanvasNodeData, imageId: string) => void handleRetryNode(node, imageId), [handleRetryNode]);

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning(t("canvas.projectPage.emptyTextImage"));
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, t],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const storedImage = await saveResultImage(image.dataUrl, `canvas-${image.id}.png`);
            const config = fitNodeSize(storedImage.width, storedImage.height);
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: image.prompt.slice(0, 32) || "Generated Image",
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
                metadata: { ...canvasAssetMetadata(storedImage), prompt: image.prompt },
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [saveResultImage, screenToCanvas, size.height, size.width],
    );

    useEffect(() => {
        if (!projectId || !directorDesk) return;
        let active = true;
        const unsubscribe = directorDesk.subscribeCaptures((detail) => {
            if (!detail?.captures?.length || detail.canvasProjectId !== projectId) return;
            void (async () => {
                for (const [index, capture] of detail.captures.entries()) {
                    if (!active) break;
                    try {
                        await insertAssistantImage({
                            id: `director-desk-${Date.now()}-${index}`,
                            prompt: capture.title || t("canvas.directorDeskCapture"),
                            dataUrl: capture.dataUrl,
                            storageKey: capture.storageKey,
                        });
                    } catch {
                        // A single broken capture should not block the remaining imports.
                    }
                }
            })();
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [directorDesk, insertAssistantImage, projectId, t]);

    const insertAssistantText = useCallback(
        (text: string, title?: string) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS }),
                title: title || text.slice(0, 32) || "Assistant Text",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertProjectAsset = useCallback((command: Omit<CanvasEditorAssetCommand, "asset"> & { asset: CanvasProjectAsset }) => {
        const { asset } = command;
        if (asset.projectId !== projectId) return;
        const target = command.targetNodeId ? nodesRef.current.find((node) => node.id === command.targetNodeId) : undefined;
        if (target && asset.kind === "IMAGE") {
            setNodes((prev) => prev.map((node) => node.id === target.id ? {
                ...node,
                title: asset.name,
                ...fitCanvasAssetNodeSize(asset.width, asset.height),
                metadata: { ...node.metadata, ...canvasAssetMetadata(asset), ...applyCanvasAssetCommandMetadata(node.metadata, command), images: undefined, primaryImageId: undefined },
            } : node));
            setSelectedNodeIds(new Set([target.id]));
            return;
        }
        const existing = nodesRef.current.find((node) => node.metadata?.assetId === asset.assetId);
        if (existing) {
            if (command.taskId || command.versionId) {
                setNodes((prev) => prev.map((node) => node.id === existing.id ? { ...node, metadata: applyCanvasAssetCommandMetadata(node.metadata, command) } : node));
            }
            setSelectedNodeIds(new Set([existing.id]));
            return;
        }
        const center = command.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
        const node = createCanvasProjectAssetNode(asset, nanoid(), center, NODE_DEFAULT_SIZE[CanvasNodeType.Audio], command);
        if (command.versionId) hostVersionIdRef.current = command.versionId;
        nodesRef.current = [...nodesRef.current, node];
        setNodes(nodesRef.current);
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
    }, [projectId, screenToCanvas, size.height, size.width]);
    insertProjectAssetRef.current = insertProjectAsset;

    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload) => {
            if (payload.kind === "text") {
                insertAssistantText(payload.content, payload.title);
            } else if (payload.asset) {
                insertProjectAsset({ requestId: nanoid(), asset: payload.asset });
            } else if (payload.kind === "video") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                setNodes((prev) => [
                    ...prev,
                    {
                        id,
                        type: CanvasNodeType.Video,
                        title: payload.title,
                        position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 },
                        width: nextSize.width,
                        height: nextSize.height,
                        metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height },
                    },
                ]);
                setSelectedNodeIds(new Set([id]));
            } else if (payload.kind === "image") {
                void insertAssistantImage({ id: `asset-${Date.now()}`, prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey }).catch((error) => {
                    if (!isGenerationCanceled(error)) message.error(error instanceof Error ? error.message : t("common.imageReadFailed"));
                });
            }
            setAssetPickerOpen(false);
        },
        [insertAssistantImage, insertAssistantText, insertProjectAsset, message, screenToCanvas, size.height, size.width, t],
    );

    useEffect(() => {
        if (!projectReady || !assetCommand || assetCommand.asset.projectId !== projectId || handledAssetCommandRef.current === assetCommand.requestId) return;
        handledAssetCommandRef.current = assetCommand.requestId;
        insertProjectAsset(assetCommand);
    }, [assetCommand, insertProjectAsset, projectId, projectReady]);

    useEffect(() => {
        const failed = taskRecords?.filter(({ task }) => task.projectId === projectId && task.status === "FAILED") || [];
        if (!failed.length) return;
        setNodes((prev) => prev.map((node) => {
            const record = failed.find((item) => item.targetNodeId === node.id && item.task.taskId === node.metadata?.taskId);
            return record ? { ...node, metadata: { ...node.metadata, status: "error", errorDetails: record.task.error?.message || "任务失败" } } : node;
        }));
    }, [projectId, taskRecords]);

    // Memoize every callback and render function passed to CanvasNode.
    // CanvasNode uses React.memo, but new prop references would invalidate it on every render and rerender every node
    // during click, hover, or viewport changes, which is especially expensive for Markdown. These useCallback values
    // and their memoized map/handler dependencies remain stable during interaction, so unchanged nodes do not rerender.
    const handleNodeHoverStart = useCallback((nodeId: string) => {
        if (nodeDraggingRef.current) return;
        setHoveredNodeId(nodeId);
    }, []);
    const handleNodeHoverEnd = useCallback((nodeId: string) => {
        setHoveredNodeId((current) => (current === nodeId ? null : current));
    }, []);
    const handleNodeViewImage = useCallback((node: CanvasNodeData, imageId?: string) => {
        setPreviewNodeId(node.id);
        setPreviewImageId(imageId || null);
    }, []);
    const handleNodeRetry = useCallback(
        (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text && (node.metadata?.textCount || 1) > 1) {
                void generateNodeRef.current?.(node.id, "text", node.metadata?.prompt || "");
                return;
            }
            void handleRetryNode(node);
        },
        [handleRetryNode],
    );
    const handleNodeContextMenu = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedNodeIds((current) => (current.has(nodeId) ? current : new Set([nodeId])));
        setSelectedConnectionId(null);
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId });
    }, []);

    const renderNodePanel = useCallback(
        (panelNode: CanvasNodeData) =>
            getNodeDefinition(panelNode.type)?.Panel ? (
                renderPluginPanel(panelNode)
            ) : panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    nodeId={panelNode.id}
                    nodes={nodes}
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || []}
                    connectedNodes={connectedNodesByNodeId.get(panelNode.id) || []}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onClose={() => setDialogNodeId(null)}
                    onDisconnectReference={disconnectNodeReference}
                    onStartReferenceSelection={startNodeReferenceSelection}
                />
            ) : (
                <CanvasNodePromptPanel
                    node={panelNode}
                    nodes={nodes}
                    isRunning={runningNodeId === panelNode.id}
                    mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || EMPTY_REFERENCES}
                    connectedNodes={connectedNodesByNodeId.get(panelNode.id) || []}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onStop={confirmStopGeneration}
                    onDisconnectReference={disconnectNodeReference}
                    onStartReferenceSelection={startNodeReferenceSelection}
                    modeOverride={getNodeDefinition(panelNode.type)?.useBuiltinPanel?.mode}
                    onImageSettingsOpenChange={(open) => {
                        setNodeImageSettingsOpen(open);
                        if (open) setToolbarNodeId(null);
                    }}
                />
            ),
        [
            configInputsById,
            confirmStopGeneration,
            connectedNodesByNodeId,
            disconnectNodeReference,
            handleConfigNodeChange,
            handleGenerateNode,
            handleNodePromptChange,
            mentionReferencesByNodeId,
            nodes,
            renderPluginPanel,
            runningNodeId,
            startNodeReferenceSelection,
        ],
    );

    const renderNodeContentPanel = useCallback(
        (contentNode: CanvasNodeData) => (
            <CanvasConfigNodePanel
                node={contentNode}
                isRunning={runningNodeId === contentNode.id}
                inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                onConfigChange={handleConfigNodeChange}
                onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                }}
            />
        ),
        [configInputsById, confirmStopGeneration, handleConfigNodeChange, handleGenerateNode, runningNodeId],
    );

    if (!projectReady) return projectLoadError !== null && projectLoaded ? (
        <main className="flex h-full min-h-0 items-center justify-center overflow-auto p-6" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <div className="flex w-full max-w-md flex-col items-center gap-3 text-center" role="alert">
                <h1 className="text-base font-medium">画布媒体加载失败</h1>
                <p className="w-full break-words text-sm opacity-70">{projectLoadError}</p>
                <button type="button" className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10" onClick={retryProjectLoad}>
                    <RefreshCw size={16} aria-hidden="true" />重新加载
                </button>
            </div>
        </main>
    ) : <CanvasRefreshShell />;

    return (
        <main className="canvas-editor relative flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            {renderEditorChrome ? (
                <CanvasSidePanel
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    onFocusNode={focusNode}
                    onPreviewNode={setPreviewNodeId}
                    onInsertAsset={handleAssetInsert}
                    onRetryTask={handleRetryNode}
                    onExportResults={exportCompletedResults}
                    exportingResults={exportingResults}
                />
            ) : null}
            <section className="relative min-w-0 flex-1 overflow-hidden">
                {renderEditorChrome ? <CanvasTopBar
                    title={currentProject?.name || t("canvas.projectPage.untitledCanvas")}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onHome={() => navigate("/")}
                    onProjects={() => navigate("/canvas")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    onExportProject={exportCurrentProject}
                    onOpenVersions={() => setVersionsOpen(true)}
                    onImportImage={() => handleUploadRequest()}
                    onOpenPlugins={pluginManager ? () => setPluginManagerOpen(true) : undefined}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    agentOpen={agentPanel?.isOpen}
                    compactAgentStatus={agentPanel ? { connected: agentPanel.connected, enabled: agentPanel.enabled, activity: agentPanel.activity } : undefined}
                    onToggleAgent={agentPanel?.toggle}
                /> : null}

                <CanvasVersionHistoryDialog
                    open={versionsOpen}
                    projectId={projectId}
                    nodes={nodes}
                    connections={connections}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    viewport={viewport}
                    onClose={() => setVersionsOpen(false)}
                    onRestore={(version) => void restoreProjectVersion(version)}
                />

                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    tool={canvasTool}
                    backgroundMode={backgroundMode}
                    onViewportChange={(next) => {
                        setViewport(next);
                        setContextMenu(null);
                    }}
                    onCanvasMouseDown={(event) => {
                        if (!referencePickerNodeId) handleCanvasMouseDown(event);
                    }}
                    onCanvasDeselect={referencePickerNodeId ? undefined : deselectCanvas}
                    onCanvasDoubleClick={(event) => {
                        if (referencePickerNodeId) return;
                        setContextMenu(null);
                        setNodeCreatePosition(screenToCanvas(event.clientX, event.clientY));
                    }}
                    onContextMenu={preventCanvasContextMenu}
                    onDrop={handleDrop}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                        {connections.map((connection) => {
                            const from = nodeById.get(connection.fromNodeId);
                            const to = nodeById.get(connection.toNodeId);
                            if (!from || !to) return null;

                            return (
                                <ConnectionPath
                                    key={connection.id}
                                    connection={connection}
                                    from={from}
                                    to={to}
                                    active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
                                    onSelect={() => {
                                        setSelectedConnectionId(connection.id);
                                        setSelectedNodeIds(new Set());
                                        setContextMenu(null);
                                    }}
                                    onContextMenu={(event) => {
                                        setSelectedConnectionId(connection.id);
                                        setSelectedNodeIds(new Set());
                                        setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId: connection.id });
                                    }}
                                />
                            );
                        })}
                        {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} /> : null}
                    </svg>

                    {visibleNodes.map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={viewport.k}
                            isSelected={selectedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={activeNodeId === node.id}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            referenceSelectionState={!referencePickerNodeId ? undefined : node.id === referencePickerNodeId ? "target" : referenceConnectedNodeIds.has(node.id) || !isCanvasReferenceNode(node, nodes) ? "disabled" : "available"}
                            showPanel={renderEditorChrome && !isNodeResizing && dialogNodeId === node.id && !selectionBox && !getNodeDefinition(node.type)?.hidePanel}
                            groupChildCount={groupChildCountById.get(node.id) || 0}
                            isGroupDropTarget={dropTargetGroupId === node.id}
                            batchExpanded={expandedBatchNodeIds.has(node.id)}
                            showImageInfo={showImageInfo}
                            mentionReferences={mentionReferencesByNodeId.get(node.id) || EMPTY_REFERENCES}
                            pluginHost={pluginHost}
                            registryVersion={nodeRegistryVersion}
                            renderPanel={renderNodePanel}
                            renderNodeContent={renderNodeContentPanel}
                            onMouseDown={handleNodeMouseDown}
                            onSelectCapture={handleNodeSelectCapture}
                            onHoverStart={handleNodeHoverStart}
                            onHoverEnd={handleNodeHoverEnd}
                            onConnectStart={handleConnectStart}
                            onResizeStart={handleNodeResizeStart}
                            onResize={handleNodeResize}
                            onResizeEnd={handleNodeResizeEnd}
                            onContentChange={handleNodeContentChange}
                            onTitleChange={handleNodeTitleChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onDuplicateBatchImage={duplicateBatchImage}
                            onDownloadBatchImage={downloadBatchImage}
                            onRetryBatchImage={retryBatchImage}
                            onDeleteBatchImage={deleteBatchImage}
                            onRetry={handleNodeRetry}
                            onViewImage={handleNodeViewImage}
                            onSelectReference={selectNodeReference}
                            onContextMenu={handleNodeContextMenu}
                        />
                    ))}

                    {referencePickerNodeId ? (
                        <button
                            type="button"
                            className="absolute left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur"
                            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}
                            onClick={exitNodeReferenceSelection}
                        >
                            {t("canvas.references.selectingHint")}
                        </button>
                    ) : null}

                    {selectionBox ? (
                        <svg
                            className="pointer-events-none absolute z-[100] overflow-visible"
                            style={{
                                ...getCanvasSelectionBoxBounds(selectionBox),
                            }}
                        >
                            <rect width="100%" height="100%" fill={theme.canvas.selectionFill} stroke={theme.canvas.selectionStroke} strokeOpacity={0.55} strokeWidth={1 / viewport.k} strokeDasharray={`${6 / viewport.k} ${4 / viewport.k}`} />
                        </svg>
                    ) : null}
                    {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                    {nodeCreatePosition ? (
                        <NodeCreateMenu
                            position={nodeCreatePosition}
                            onCreate={(type) => {
                                createNode(type, nodeCreatePosition);
                                setNodeCreatePosition(null);
                            }}
                            onClose={() => setNodeCreatePosition(null)}
                        />
                    ) : null}
                </InfiniteCanvas>

                <CanvasNodeHoverToolbar
                    node={contextMenu || isNodeDragging || isNodeResizing || nodeImageSettingsOpen || expandedBatchNodeIds.has(toolbarNode?.id || "") ? null : toolbarNode}
                    viewport={viewport}
                    extraTools={toolbarNode ? buildNodeToolbarItems(toolbarNode) : undefined}
                    onKeep={keepNodeToolbar}
                    onLeave={hideNodeToolbar}
                    onInfo={(node) => setInfoNodeId(node.id)}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                    onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onDownload={downloadNodeImage}
                    onSaveAsset={(node) => (hostMode === "mock" ? message.info("该素材暂不能保存到项目素材库") : void saveNodeAsset(node))}
                    onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                    onCrop={(node) => setCropNodeId(node.id)}
                    onSplit={(node) => { setSplitBatch(null); setSplitNodeId(node.id); }}
                    onUpscale={(node) => setUpscaleNodeId(node.id)}
                    onAngle={(node) => setAngleNodeId(node.id)}
                    onViewImage={handleNodeViewImage}
                    onReversePrompt={createImageReversePromptNodes}
                    onRetry={(node) => void handleRetryNode(node)}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                    canImportVideo={Boolean(importVideo)}
                    canImportAudio={Boolean(importAudio)}
                    onUngroup={(node) => ungroupSelection(new Set([node.id]))}
                />

                {hasMultipleSelectedNodes && !selectionBox ? (
                    <CanvasSelectionToolbar
                        nodes={selectedNodes}
                        viewport={viewport}
                        showToolbar={!isNodeDragging && !isNodeResizing}
                        canGroup={canGroupSelection}
                        canUngroup={canUngroupSelection}
                        onTidyLayout={tidyCanvasLayout}
                        onGroup={groupSelection}
                        onUngroup={ungroupSelection}
                    />
                ) : null}

                <CanvasToolbar
                    standalone={hostMode === "mock"}
                    selectedCount={selectedNodeIds.size}
                    canvasTool={canvasTool}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    onTidyLayout={tidyCanvasLayout}
                    onAddImage={() => createNode(CanvasNodeType.Image)}
                    onAddVideo={() => createNode(CanvasNodeType.Video)}
                    onAddAudio={() => createNode(CanvasNodeType.Audio)}
                    canAddVideo={Boolean(importVideo)}
                    canAddAudio={Boolean(importAudio)}
                    onAddText={() => createNode(CanvasNodeType.Text)}
                    onAddConfig={() => createNode(CanvasNodeType.Config)}
                    onAddGroup={() => createNode(CanvasNodeType.Group)}
                    onAddExtensionNode={(type) => createNode(type)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onOpenAssets={() => setAssetPickerOpen(true)}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onClear={() => setClearConfirmOpen(true)}
                    onCanvasToolChange={setCanvasTool}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                    directorDeskEnabled={directorDesk?.isEnabled()}
                    onOpenDirectorDesk={() => directorDesk?.open({ instanceId: `canvas-${projectId || "unknown"}`, canvasProjectId: projectId || undefined })}
                />

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onReset={resetViewport} onFit={fitCanvasToNodes} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} />

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        canCaptureVideoFrame={contextMenuNode?.type === CanvasNodeType.Video && Boolean(contextMenuNode.metadata?.content)}
                        canGroup={contextMenu.type === "node" && canGroupSelection}
                        canUngroup={contextMenu.type === "node" && canUngroupSelection}
                        onTidyLayout={() => {
                            const ids = contextMenu.type === "node" && selectedNodeIds.has(contextMenu.nodeId) ? selectedNodeIds : contextMenu.type === "node" ? new Set([contextMenu.nodeId]) : new Set<string>();
                            tidyCanvasLayout(ids);
                            setContextMenu(null);
                        }}
                        onClose={() => setContextMenu(null)}
                        onCaptureVideoFrame={(position) => {
                            if (contextMenu.type !== "node") return;
                            void captureVideoNodeFrame(contextMenu.nodeId, position);
                        }}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onGroup={groupSelection}
                        onUngroup={ungroupSelection}
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                deleteNodes(new Set([contextMenu.nodeId]));
                            } else {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                <input ref={imageInputRef} type="file" multiple accept={["image/*", importVideo ? "video/*" : "", importAudio ? "audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" : ""].filter(Boolean).join(",")} className="hidden" onChange={handleImageInputChange} />

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />
                {pluginManager ? <CanvasPluginManagerModal open={pluginManagerOpen} pluginManager={pluginManager} onClose={() => setPluginManagerOpen(false)} /> : null}

                {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} saving={cropSaving} onClose={() => setCropNodeId(null)} onConfirm={(crop) => void cropImageNode(cropNode!, crop)} /> : null}

                {maskEditNode?.metadata?.content ? (
                    <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open={Boolean(maskEditNode)} saving={maskSaving} canGenerate={hostMode !== "mock"} onClose={() => setMaskEditNodeId(null)} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)} />
                ) : null}

                {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} saving={splitSaving}
                    result={splitBatch ? { saved: splitBatch.items.filter((item) => item.node).length, failures: splitBatch.items.flatMap((item) => item.error ? [{ row: item.piece.row, column: item.piece.column, error: item.error }] : []) } : undefined}
                    onClose={() => { setSplitNodeId(null); setSplitBatch(null); }} onConfirm={(params) => void splitImageNode(splitNode!, params)} /> : null}

                {upscaleNode?.metadata?.content ? (
                    <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open={Boolean(upscaleNode)} saving={upscaleSaving} onClose={() => setUpscaleNodeId(null)} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params)} />
                ) : null}

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                <Modal
                    className="canvas-overlay-modal"
                    title={t("canvas.projectPage.imageDetails")}
                    open={Boolean(previewContent)}
                    centered
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    width="auto"
                    styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewContent ? <img src={previewContent} alt={previewNode?.title || t("assets.kinds.image")} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} /> : null}
                </Modal>

                <Modal
                    className="canvas-overlay-modal"
                    title={t("canvas.projectPage.clearTitle")}
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>{t("common.cancel")}</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                {t("canvas.projectPage.clear")}
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">{t("canvas.projectPage.clearDescription")}</p>
                </Modal>

                <AssetPickerModal open={assetPickerOpen} library={assetLibrary} onInsert={handleAssetInsert} onClose={() => setAssetPickerOpen(false)} />
            </section>
            <CanvasInspectorPanel node={selectedNodes.length === 1 ? selectedNodes[0] : undefined} onTitleChange={handleNodeTitleChange} onOpenSettings={(node) => setDialogNodeId(node.id)} onUpload={(node) => handleUploadRequest(node.id)} />
        </main>
    );
}
