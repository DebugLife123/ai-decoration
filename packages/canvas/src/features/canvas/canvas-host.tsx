import { createContext, useContext, type ReactNode } from "react";
import type { CanvasApi, CanvasAudioImporter, CanvasEditorAssetCommand, CanvasImageImporter, CanvasTask, CanvasTaskApi, CanvasVideoImporter } from "./contracts";
import type { CanvasTaskExecution } from "../../services/api/canvas/task-workflow";
import type { CanvasAssetLibrary } from "./asset-library";
import type { CanvasAssetManager } from "./asset-manager";
import type { CanvasMediaAdapter } from "./media";
import type { CanvasImageGeneration, CanvasPluginImageGeneration } from "./image-generation";
import type { CanvasAudioGeneration } from "./audio-generation";
import type { CanvasVideoGeneration } from "./video-generation";
import type { CanvasGenerationPreferences } from "./generation-preferences";
import type { CanvasTextGeneration } from "./plugin-text-generation";
import type { CanvasProjectHost, CanvasVersionHost } from "./project-host";
import type { CanvasAgentBridge, CanvasAgentBridgeContext } from "./agent-bridge-contract";
import type { CanvasPluginManager } from "./plugin-manager";
import type { InsertAssetPayload } from "./asset-library";
import { canvasThemes, type CanvasColorTheme, type CanvasTheme } from "../../lib/canvas-theme";

export type CanvasConfigAccess = {
    isReady(model: string): boolean;
    openSettings(shouldPromptContinue?: boolean): void;
};

export type CanvasUserAsset =
    | { kind: "text"; title: string; content: string; nodeId: string; prompt?: string }
    | { kind: "image"; title: string; url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string; nodeId: string; prompt?: string }
    | { kind: "video"; title: string; url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string; nodeId: string; prompt?: string };

export type CanvasDirectorDesk = {
    isEnabled(): boolean;
    open(options: { instanceId: string; canvasProjectId?: string }): void;
    subscribeCaptures(listener: (detail: { canvasProjectId?: string | null; captures: Array<{ title?: string; dataUrl: string; storageKey?: string }> }) => void): () => void;
};

export type CanvasAgentPanel = {
    isOpen: boolean;
    connected: boolean;
    enabled: boolean;
    activity: string;
    fragmentBootstrap: boolean;
    open(): void;
    toggle(): void;
};

export type CanvasHostTaskRecord = {
    task: CanvasTask;
    title?: string;
    targetNodeId?: string;
};

export type CanvasHost = {
    colorTheme: CanvasColorTheme;
    setColorTheme: (theme: CanvasColorTheme) => void;
    projectId: string;
    projects: CanvasProjectHost;
    versions: CanvasVersionHost;
    navigate: (path: string, options?: { replace?: boolean }) => void;
    searchParams: URLSearchParams;
    mode: "local" | "mock";
    /** Set false when the host renders CanvasWorkbenchLayout around the editor. */
    editorChrome?: boolean;
    /** Optional project/asset/task boundary for hosts migrating from local persistence to HTTP. */
    api?: CanvasApi;
    tasks?: CanvasTaskApi;
    taskExecution?: CanvasTaskExecution;
    /** Read-only task records supplied by the host; the editor only displays records for the active project. */
    taskRecords?: CanvasHostTaskRecord[];
    onTaskRecordChange?: (record: CanvasHostTaskRecord) => void;
    importImage: CanvasImageImporter;
    importVideo?: CanvasVideoImporter;
    importAudio?: CanvasAudioImporter;
    assetLibrary: CanvasAssetLibrary;
    media: CanvasMediaAdapter;
    imageGeneration?: CanvasImageGeneration;
    pluginImageGeneration?: CanvasPluginImageGeneration;
    audioGeneration?: CanvasAudioGeneration;
    videoGeneration?: CanvasVideoGeneration;
    generationPreferences?: CanvasGenerationPreferences;
    textGeneration?: CanvasTextGeneration;
    pluginManager?: CanvasPluginManager;
    agentPanel?: CanvasAgentPanel;
    agentBridge?: CanvasAgentBridge;
    directorDesk?: CanvasDirectorDesk;
    config?: CanvasConfigAccess;
    addToUserAssets?: (asset: CanvasUserAsset) => void;
    assetManager?: CanvasAssetManager;
    assetCommand?: CanvasEditorAssetCommand;
    renderPromptLibrary?: (props: { onInsert: (payload: InsertAssetPayload) => void; theme: CanvasTheme }) => ReactNode;
    renderPromptSelector?: (props: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void }) => ReactNode;
    renderUserActions?: (actions: { onOpenShortcuts: () => void; onOpenPlugins?: () => void }) => ReactNode;
};

export const CanvasHostContext = createContext<CanvasHost | null>(null);

export function useCanvasHost() {
    const host = useContext(CanvasHostContext);
    if (!host) throw new Error("CanvasEditor 需要 CanvasHostContext");
    return host;
}

export function useCanvasTheme(): { colorTheme: CanvasColorTheme; theme: CanvasTheme; setColorTheme: CanvasHost["setColorTheme"] } {
    const { colorTheme, setColorTheme } = useCanvasHost();
    return { colorTheme, theme: canvasThemes[colorTheme], setColorTheme };
}

