import type { CanvasBackgroundMode } from "../../lib/canvas-theme";
import type { CanvasConnection, CanvasNodeData } from "../../types/canvas";
import type { CanvasAssistantSession } from "../../types/canvas";

export type CanvasHistorySnapshot = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

export function hasCanvasHistoryChanged(previous: CanvasHistorySnapshot | null, next: CanvasHistorySnapshot) {
    return !previous || previous.nodes !== next.nodes || previous.connections !== next.connections || previous.chatSessions !== next.chatSessions || previous.activeChatId !== next.activeChatId || previous.backgroundMode !== next.backgroundMode || previous.showImageInfo !== next.showImageInfo;
}
