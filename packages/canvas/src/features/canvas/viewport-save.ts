import type { CanvasProjectDocument } from "./contracts";
import type { CanvasProjectSaveScope } from "./project-save";

export type CanvasViewportSaveScheduler = {
    schedule(save: () => void): void;
    cancel(): void;
};

export function createCanvasViewportSaveScheduler(): CanvasViewportSaveScheduler {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return {
        schedule(save) {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                save();
            }, 500);
        },
        cancel() {
            if (timer !== null) clearTimeout(timer);
            timer = null;
        },
    };
}

export async function saveCanvasViewportSnapshot({
    projectId,
    scope,
    isScopeCurrent,
    readDocument,
    readViewport,
    writeDocument,
    saveDocument,
    onError,
}: {
    projectId: string;
    scope: CanvasProjectSaveScope;
    isScopeCurrent: (scope: CanvasProjectSaveScope) => boolean;
    readDocument: () => CanvasProjectDocument | null;
    readViewport: () => CanvasProjectDocument["viewport"];
    writeDocument: (document: CanvasProjectDocument) => void;
    saveDocument: (projectId: string, document: CanvasProjectDocument) => Promise<void>;
    onError: (error: unknown) => void;
}) {
    if (!isScopeCurrent(scope)) return;
    const current = readDocument();
    if (!current) return;
    const document = { ...current, viewport: readViewport() };
    writeDocument(document);
    try {
        await saveDocument(projectId, document);
    } catch (error) {
        if (isScopeCurrent(scope)) onError(error);
    }
}
