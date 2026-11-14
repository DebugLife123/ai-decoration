import type { CanvasMediaAdapter } from "./media";
import { restoreCanvasMedia } from "./media";
import type { CanvasProjectDocument } from "./contracts";
import type { CanvasProjectHost } from "./project-host";

export async function restoreCanvasProjectDocument(
    getDocument: CanvasProjectHost["getDocument"],
    media: CanvasMediaAdapter,
    projectId: string,
    signal: AbortSignal,
): Promise<CanvasProjectDocument | null> {
    const project = await getDocument(projectId, signal);
    signal.throwIfAborted();
    if (!project) return null;
    const restored = await restoreCanvasMedia(media, projectId, { nodes: project.nodes, chatSessions: project.chatSessions || [] }, signal);
    return { ...project, nodes: restored.nodes, chatSessions: restored.chatSessions };
}
