import type { CanvasProjectDocument } from "./contracts";

export type CanvasProjectSaveScope = { projectId: string; projectLoadAttempt: number };

export function createCanvasProjectSaveQueue() {
    const pending = new Map<string, Promise<void>>();
    return async function saveInOrder(projectId: string, save: () => void | Promise<void>) {
        const previous = pending.get(projectId) || Promise.resolve();
        const current = previous.catch(() => undefined).then(save);
        pending.set(projectId, current);
        try {
            await current;
        } finally {
            if (pending.get(projectId) === current) pending.delete(projectId);
        }
    };
}

export function isCanvasProjectSaveScopeCurrent(request: CanvasProjectSaveScope, current: CanvasProjectSaveScope) {
    return request.projectId === current.projectId && request.projectLoadAttempt === current.projectLoadAttempt;
}

export function createCanvasAutosaveDocument(
    document: Omit<CanvasProjectDocument, "currentVersionId">,
    { hostVersionId, canvasChanged, previousVersionId }: { hostVersionId: string | null; canvasChanged: boolean; previousVersionId: string | null },
): CanvasProjectDocument {
    return {
        ...document,
        currentVersionId: hostVersionId || (canvasChanged ? null : previousVersionId),
    };
}
