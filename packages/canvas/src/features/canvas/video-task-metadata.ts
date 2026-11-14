import type { CanvasNodeData, CanvasNodeMetadata } from "../../types/canvas";
import type { CanvasVideoProviderHandle } from "./video-generation";

type PersistedVideoTaskMetadata = Pick<CanvasNodeMetadata, "videoTaskId" | "videoTaskProvider" | "videoTaskModel">;

export function getCanvasVideoTaskMetadata(handle: CanvasVideoProviderHandle): PersistedVideoTaskMetadata | null {
    if (handle.provider === "plugin") return null;
    return { videoTaskId: handle.id, videoTaskProvider: handle.provider, videoTaskModel: handle.model };
}

export function applyCanvasVideoTaskHandle(item: CanvasNodeData, handle: CanvasVideoProviderHandle, model?: string): CanvasNodeData {
    const taskMetadata = getCanvasVideoTaskMetadata(handle);
    if (!taskMetadata) return item;
    return { ...item, metadata: { ...item.metadata, ...taskMetadata, ...(model ? { model } : {}) } };
}
