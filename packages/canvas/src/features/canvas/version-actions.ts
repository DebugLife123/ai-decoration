import type { CanvasVersionDocument } from "./contracts";
import type { CanvasVersionHost } from "./project-host";
import { selectCanvasVersionId } from "./version-selection";

type CanvasVersionCommands = Pick<CanvasVersionHost, "getSnapshot" | "saveVersion" | "deleteVersion">;

export function saveCanvasVersionSnapshot(
    host: CanvasVersionCommands,
    projectId: string,
    version: Omit<CanvasVersionDocument, "versionId" | "projectId">,
) {
    return host.saveVersion(projectId, structuredClone(version));
}

export async function deleteCanvasVersionAndSelect(
    host: CanvasVersionCommands,
    projectId: string,
    versionId: string,
) {
    await host.deleteVersion(projectId, versionId);
    const snapshot = host.getSnapshot(projectId);
    return selectCanvasVersionId(snapshot.versions, snapshot.currentVersionId);
}
