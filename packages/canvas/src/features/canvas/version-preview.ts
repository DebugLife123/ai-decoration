import type { CanvasVersionDocument } from "./contracts";
import type { CanvasMediaAdapter } from "./media";
import { restoreCanvasMedia } from "./media";
import type { CanvasNodeData } from "../../types/canvas";

export async function loadCanvasVersionPreview(
    media: CanvasMediaAdapter,
    projectId: string,
    version: Pick<CanvasVersionDocument, "nodes">,
    signal: AbortSignal,
): Promise<CanvasNodeData[]> {
    const restored = await restoreCanvasMedia(media, projectId, { nodes: version.nodes, chatSessions: [] }, signal);
    signal.throwIfAborted();
    return restored.nodes;
}
