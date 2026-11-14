import type { CanvasBackgroundMode } from "../../lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData } from "../../types/canvas";
import type { CanvasProjectDocument } from "./contracts";

export type CanvasHistorySnapshot = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

export type CanvasProjectRestoreState = {
    document: CanvasProjectDocument;
    baseline: Pick<CanvasHistorySnapshot, "nodes" | "connections" | "backgroundMode" | "showImageInfo">;
    history: CanvasHistorySnapshot;
};

export function createCanvasProjectRestoreState(project: CanvasProjectDocument): CanvasProjectRestoreState {
    const activeChatId = project.activeChatId || null;
    const showImageInfo = project.showImageInfo || false;
    const document = { ...project, activeChatId, showImageInfo };
    const baseline = { nodes: project.nodes, connections: project.connections, backgroundMode: project.backgroundMode, showImageInfo };
    return {
        document,
        baseline,
        history: { ...baseline, chatSessions: project.chatSessions, activeChatId },
    };
}
