import type { CanvasVersionDocument } from "./contracts";

export function selectCanvasVersionId(versions: Array<Pick<CanvasVersionDocument, "versionId">>, currentVersionId: string | null): string {
    if (currentVersionId && versions.some((version) => version.versionId === currentVersionId)) return currentVersionId;
    return versions[0]?.versionId || "";
}
