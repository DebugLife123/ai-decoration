import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { applyCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "../../lib/canvas/canvas-agent-ops";
import type { CanvasNodeGenerationMode } from "../../components/canvas/canvas-node-prompt-panel";
import type { CanvasConnection, CanvasNodeData, ContextMenuState, ViewportTransform } from "../../types/canvas";
import type { CanvasMediaAdapter } from "./media";
import type { CanvasAgentBridgeContext } from "./agent-bridge-contract";
import { isCanvasAgentScopeCurrent } from "./agent-bridge-scope";

type GenerateNodeRef = MutableRefObject<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>;
type ScopedAgentSnapshot = CanvasAgentSnapshot & { scopeKey: string };

type AgentBridgeParams = {
    enabled?: boolean;
    scopeKey: string;
    setCanvasContext?: (context: CanvasAgentBridgeContext | null) => void;
    projectId: string;
    media: CanvasMediaAdapter;
    title: string | undefined;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Set<string>;
    viewport: ViewportTransform;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    viewportRef: MutableRefObject<ViewportTransform>;
    generateNodeRef: GenerateNodeRef;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

/**
 * Bridge between the canvas and a host Agent: publish the current snapshot and apply/undo capabilities.
 */
export function useAgentBridge(params: AgentBridgeParams) {
    const { enabled = true, scopeKey, setCanvasContext, projectId, media, title, nodes, connections, selectedNodeIds, viewport, nodesRef, connectionsRef, selectedNodeIdsRef, viewportRef, generateNodeRef, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setViewport, setContextMenu } =
        params;
    const [agentUndoSnapshot, setAgentUndoSnapshot] = useState<ScopedAgentSnapshot | null>(null);
    const activeScopeRef = useRef({ enabled, scopeKey });
    activeScopeRef.current = { enabled, scopeKey };
    const isCurrentScope = useCallback(() => isCanvasAgentScopeCurrent(activeScopeRef.current, scopeKey), [scopeKey]);
    const projectTitle = title || "";

    const agentSnapshot = useMemo<CanvasAgentSnapshot>(() => ({ projectId, title: projectTitle, nodes, connections, selectedNodeIds: Array.from(selectedNodeIds), viewport }), [connections, projectTitle, nodes, projectId, selectedNodeIds, viewport]);
    const applyAgentOps = useCallback(
        (ops?: CanvasAgentOp[]) => {
            if (!isCurrentScope()) throw new Error("画布项目已切换，请重新读取后再操作");
            const safeOps = Array.isArray(ops) ? ops.filter((op) => op?.type) : [];
            const before = { projectId, title: projectTitle, nodes: nodesRef.current, connections: connectionsRef.current, selectedNodeIds: Array.from(selectedNodeIdsRef.current), viewport: viewportRef.current };
            const generationOps = safeOps.filter((op): op is Extract<CanvasAgentOp, { type: "run_generation" }> => op.type === "run_generation" && Boolean(op.nodeId));
            const next = applyCanvasAgentOps(
                before,
                safeOps.filter((op) => op.type !== "run_generation"),
            );
            nodesRef.current = next.nodes;
            connectionsRef.current = next.connections;
            selectedNodeIdsRef.current = new Set(next.selectedNodeIds);
            viewportRef.current = next.viewport;
            setAgentUndoSnapshot({ ...before, scopeKey });
            setNodes(next.nodes);
            setConnections(next.connections);
            setSelectedNodeIds(new Set(next.selectedNodeIds));
            setSelectedConnectionId(null);
            setViewport(next.viewport);
            setContextMenu(null);
            if (generationOps.length) {
                queueMicrotask(() =>
                    generationOps.forEach((op) => {
                        if (!isCurrentScope()) return;
                        const target = nodesRef.current.find((node) => node.id === op.nodeId);
                        const prompt = op.prompt?.trim() ? op.prompt : (target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                        void generateNodeRef.current?.(op.nodeId, op.mode || target?.metadata?.generationMode || "image", prompt);
                    }),
                );
            }
            return { ...next, projectId, title: projectTitle };
        },
        [isCurrentScope, projectTitle, projectId, scopeKey],
    );
    const undoAgentOps = useCallback(() => {
        if (!isCurrentScope() || !agentUndoSnapshot || agentUndoSnapshot.projectId !== projectId || agentUndoSnapshot.scopeKey !== scopeKey) return null;
        nodesRef.current = agentUndoSnapshot.nodes;
        connectionsRef.current = agentUndoSnapshot.connections;
        selectedNodeIdsRef.current = new Set(agentUndoSnapshot.selectedNodeIds);
        viewportRef.current = agentUndoSnapshot.viewport;
        setNodes(agentUndoSnapshot.nodes);
        setConnections(agentUndoSnapshot.connections);
        setSelectedNodeIds(new Set(agentUndoSnapshot.selectedNodeIds));
        setSelectedConnectionId(null);
        setViewport(agentUndoSnapshot.viewport);
        setContextMenu(null);
        setAgentUndoSnapshot(null);
        const { scopeKey: _scopeKey, ...snapshot } = agentUndoSnapshot;
        return { ...snapshot, projectId, title: projectTitle };
    }, [agentUndoSnapshot, isCurrentScope, projectTitle, projectId, scopeKey]);

    useEffect(() => {
        if (!enabled || !setCanvasContext) return;
        const canUndo = Boolean(agentUndoSnapshot && agentUndoSnapshot.projectId === projectId && agentUndoSnapshot.scopeKey === scopeKey);
        setCanvasContext({ snapshot: agentSnapshot, media, applyOps: applyAgentOps, undoOps: undoAgentOps, canUndo });
        return () => setCanvasContext(null);
    }, [agentSnapshot, applyAgentOps, agentUndoSnapshot, enabled, media, projectId, scopeKey, setCanvasContext, undoAgentOps]);

    return { applyAgentOps };
}
