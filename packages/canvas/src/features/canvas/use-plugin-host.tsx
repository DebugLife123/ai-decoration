import { useCallback, useEffect, useLayoutEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";

import { generateCanvasPluginVideo } from "../../services/api/canvas/plugin-video";
import { generateCanvasPluginImage } from "../../services/api/canvas/plugin-image";
import { useCanvasHost } from "./canvas-host";
import { defaultCanvasGenerationPreferences, type CanvasModelCapability } from "./generation-preferences";
import { buildCanvasGenerationConfig as buildGenerationConfig } from "./generation-preferences";
import { buildNodeContext } from "../../lib/canvas/plugin-node-context";
import { getNodeDefinition } from "../../lib/canvas/node-registry";
import { canvasThemes } from "../../lib/canvas-theme";
import type { CanvasNodeToolbarItem, CanvasPluginAi, CanvasPluginHost } from "../../types/canvas-plugin";
import type { ReferenceImage } from "../../types/image";
import type { CanvasAgentOp } from "../../lib/canvas/canvas-agent-ops";
import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "../../types/canvas";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

type PluginHostParams = {
    enabled?: boolean;
    openConfigDialog: (open: boolean) => void;
    theme: CanvasTheme;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    viewportRef: MutableRefObject<ViewportTransform>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    applyAgentOps: (ops?: CanvasAgentOp[]) => unknown;
};

/**
 * Plugin node host capabilities: expose host-side AI generation, canvas access, and panel controls
 * through plugin-callable host/ai objects. Loads installed remote plugins on mount and returns renderers for plugin panels and toolbars.
 */
export function usePluginHost(params: PluginHostParams) {
    const { t } = useTranslation();
    const { enabled = true, openConfigDialog, theme, nodesRef, connectionsRef, viewportRef, setNodes, setDialogNodeId, applyAgentOps } = params;
    const { projectId, mode, generationPreferences, config, importVideo, media, pluginImageGeneration, videoGeneration, textGeneration, pluginManager } = useCanvasHost();
    const effectiveConfig = generationPreferences ?? defaultCanvasGenerationPreferences;
    const generationScope = useMemo(() => ({ controller: new AbortController() }), [projectId, importVideo, media, videoGeneration, enabled]);
    useLayoutEffect(() => {
        // Renew on effect setup so StrictMode's cleanup does not disable later requests.
        const controller = new AbortController();
        generationScope.controller = controller;
        return () => controller.abort();
    }, [generationScope]);

    // Host capabilities available to plugin nodes; methods receive nodeId and are not bound to a specific node.
    const pluginAi = useMemo<CanvasPluginAi>(() => {
        // Convert plugin reference images (data URLs or URLs) into the ReferenceImage[] expected by the host generation API.
        const toReferences = (refs?: string[]): ReferenceImage[] => (refs || []).filter(Boolean).map((src, index) => ({ id: `plugin-ref-${index}`, name: `ref-${index}.png`, type: "image/png", dataUrl: src }));
        // Open the configuration dialog and throw when AI is not configured, allowing the plugin to handle the error.
        const ensureReady = (model: string) => {
            if (mode === "mock" || !config?.isReady(model)) {
                openConfigDialog(true);
                throw new Error(t("canvas.plugins.aiConfigRequired"));
            }
        };
        return {
            generateImage: async (prompt, options) => {
                if (!enabled) throw new Error("当前画布未启用插件生成");
                const signal = options?.signal ? AbortSignal.any([generationScope.controller.signal, options.signal]) : generationScope.controller.signal;
                signal.throwIfAborted();
                const config = { ...buildGenerationConfig(effectiveConfig, undefined, "image"), count: String(options?.count || 1), ...(options?.model ? { model: options.model } : {}), ...(options?.size ? { size: options.size } : {}) };
                ensureReady(config.model);
                if (!pluginImageGeneration) throw new Error("当前宿主不支持插件图片生成");
                return generateCanvasPluginImage(media, projectId, config, prompt, toReferences(options?.references), signal, pluginImageGeneration);
            },
            generateVideo: async (prompt, options) => {
                if (!enabled) throw new Error("当前画布未启用插件生成");
                const signal = options?.signal ? AbortSignal.any([generationScope.controller.signal, options.signal]) : generationScope.controller.signal;
                signal.throwIfAborted();
                const config = {
                    ...buildGenerationConfig(effectiveConfig, undefined, "video"),
                    ...(options?.model ? { model: options.model } : {}),
                    ...(options?.size ? { size: options.size } : {}),
                    ...(options?.seconds ? { videoSeconds: options.seconds } : {}),
                };
                ensureReady(config.model);
                const settings = { model: config.model, size: config.size, seconds: config.videoSeconds, quality: config.vquality, generateAudio: config.videoGenerateAudio, watermark: config.videoWatermark, mode: config.videoMode };
                return generateCanvasPluginVideo(media, projectId, importVideo, videoGeneration, settings, prompt, toReferences(options?.references), signal);
            },
            generateText: async (prompt, options) => {
                const config = { ...buildGenerationConfig(effectiveConfig, undefined, "text"), ...(options?.model ? { model: options.model } : {}) };
                ensureReady(config.model);
                if (!textGeneration) throw new Error("当前宿主不支持插件文本生成");
                const messages = [...(options?.system ? [{ role: "system" as const, content: options.system }] : []), { role: "user" as const, content: prompt }];
                return textGeneration.execute({ model: config.model, reasoningEffort: config.reasoningEffort, messages, onDelta: options?.onDelta }, options?.signal);
            },
            // List configured models for a capability; labels use the model name without the channel prefix.
            listModels: (capability) => capability ? effectiveConfig.models[capability as CanvasModelCapability] : effectiveConfig.allModels,
            defaultModel: (capability) => buildGenerationConfig(effectiveConfig, undefined, capability as CanvasModelCapability).model,
        };
    }, [effectiveConfig, mode, config, openConfigDialog, t, enabled, projectId, importVideo, media, pluginImageGeneration, videoGeneration, textGeneration, generationScope]);

    const pluginHost = useMemo<CanvasPluginHost>(
        () => ({
            getNode: (id) => nodesRef.current.find((node) => node.id === id) || null,
            getNodes: () => nodesRef.current,
            getConnections: () => connectionsRef.current,
            getUpstream: (nodeId) =>
                connectionsRef.current
                    .filter((conn) => conn.toNodeId === nodeId)
                    .map((conn) => nodesRef.current.find((node) => node.id === conn.fromNodeId))
                    .filter((node): node is CanvasNodeData => Boolean(node)),
            getDownstream: (nodeId) =>
                connectionsRef.current
                    .filter((conn) => conn.fromNodeId === nodeId)
                    .map((conn) => nodesRef.current.find((node) => node.id === conn.toNodeId))
                    .filter((node): node is CanvasNodeData => Boolean(node)),
            updateNode: (nodeId, patch) => setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))),
            updateMetadata: (nodeId, patch) => setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node))),
            applyOps: (ops) => applyAgentOps(ops),
            ai: pluginAi,
            openPanel: (nodeId) => setDialogNodeId(nodeId),
            closePanel: () => setDialogNodeId(null),
        }),
        [applyAgentOps, pluginAi],
    );

    const renderPluginPanel = useCallback(
        (panelNode: CanvasNodeData) => {
            const Panel = getNodeDefinition(panelNode.type)?.Panel;
            if (!Panel) return null;
            const ctx = buildNodeContext(pluginHost, panelNode, theme, viewportRef.current.k);
            return <Panel ctx={ctx} onClose={() => setDialogNodeId(null)} />;
        },
        [pluginHost, theme],
    );

    // Build the node toolbar from plugin items and a host-provided interaction/move toggle when enabled.
    const buildNodeToolbarItems = useCallback(
        (node: CanvasNodeData): CanvasNodeToolbarItem[] => {
            const definition = getNodeDefinition(node.type);
            const ctx = buildNodeContext(pluginHost, node, theme, viewportRef.current.k);
            const custom = definition?.toolbar?.(ctx) || [];
            // Show the interaction/move toggle only for nodes with content that are not forced into an interactive state.
            if (!definition?.interactionToggle || !node.metadata?.content || definition.forceInteractive?.(node)) return custom;
            const interactive = Boolean(node.metadata?.interactive);
            const toggle: CanvasNodeToolbarItem = {
                id: "node-interaction-toggle",
                title: t(interactive ? "canvas.plugins.interactiveTitle" : "canvas.plugins.movableTitle"),
                label: t(interactive ? "canvas.plugins.move" : "canvas.plugins.interact"),
                icon: interactive ? "✋" : "🖐",
                active: interactive,
                onClick: () => pluginHost.updateMetadata(node.id, { interactive: !interactive }),
            };
            return [toggle, ...custom];
        },
        [pluginHost, t, theme],
    );

    useEffect(() => {
        if (!enabled || !pluginManager) return;
        void pluginManager.load();
    }, [enabled, pluginManager]);

    return { pluginHost, renderPluginPanel, buildNodeToolbarItems };
}
