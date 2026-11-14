import type { CanvasAgentOp, CanvasAgentSnapshot } from "../../lib/canvas/canvas-agent-ops";
import type { CanvasMediaAdapter } from "./media";

export type CanvasAgentBridgeContext = {
    snapshot: CanvasAgentSnapshot;
    media: CanvasMediaAdapter;
    applyOps: (ops?: CanvasAgentOp[]) => CanvasAgentSnapshot;
    undoOps: () => CanvasAgentSnapshot | null;
    canUndo: boolean;
};

export type CanvasAgentBridge = {
    setCanvasContext(context: CanvasAgentBridgeContext | null): void;
};
