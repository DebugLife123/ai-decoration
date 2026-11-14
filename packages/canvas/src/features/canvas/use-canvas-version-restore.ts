import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from "react";
import type { CanvasProjectDocument, CanvasVersionDocument } from "./contracts";
import type { CanvasMediaAdapter } from "./media";
import { restoreCanvasVersionDocument } from "./version-restore";
import type { CanvasProjectHost } from "./project-host";

export function useCanvasVersionRestore({
    projectId,
    currentDocument,
    media,
    saveDocument,
}: {
    projectId: string;
    currentDocument: MutableRefObject<CanvasProjectDocument | null>;
    media: CanvasMediaAdapter;
    saveDocument: CanvasProjectHost["saveDocument"];
}) {
    const controllerRef = useRef<AbortController | null>(null);

    useLayoutEffect(() => () => {
        controllerRef.current?.abort();
        controllerRef.current = null;
    }, [projectId]);

    const restoreVersion = useCallback(async (version: CanvasVersionDocument) => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
            const document = currentDocument.current;
            if (!document) throw new Error("画布项目尚未加载");
            const restored = await restoreCanvasVersionDocument(projectId, document, version, media, saveDocument, controller.signal);
            if (controller.signal.aborted) return null;
            currentDocument.current = restored;
            return restored;
        } catch (error) {
            if (controller.signal.aborted) return null;
            throw error;
        } finally {
            if (controllerRef.current === controller) controllerRef.current = null;
        }
    }, [currentDocument, media, projectId, saveDocument]);

    return { restoreVersion };
}
