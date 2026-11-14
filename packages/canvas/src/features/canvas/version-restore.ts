import type { CanvasProjectDocument, CanvasVersionDocument } from "./contracts";
import type { CanvasMediaAdapter } from "./media";
import { restoreCanvasMedia } from "./media";
import type { CanvasProjectHost } from "./project-host";

export async function restoreCanvasVersionDocument(
    projectId: string,
    currentDocument: CanvasProjectDocument,
    version: CanvasVersionDocument,
    media: CanvasMediaAdapter,
    saveDocument: CanvasProjectHost["saveDocument"],
    signal: AbortSignal,
): Promise<CanvasProjectDocument> {
    const { nodes } = await restoreCanvasMedia(media, projectId, { nodes: version.nodes, chatSessions: [] }, signal);
    const document: CanvasProjectDocument = {
        ...currentDocument,
        nodes,
        connections: structuredClone(version.connections),
        backgroundMode: version.backgroundMode,
        showImageInfo: version.showImageInfo,
        viewport: { ...version.viewport },
        currentVersionId: version.versionId,
    };
    signal.throwIfAborted();
    await saveDocument(projectId, document);
    signal.throwIfAborted();
    return document;
}
