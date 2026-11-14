import { useCallback, useEffect, useState } from "react";
import type { CanvasMediaAdapter } from "./media";
import type { CanvasProjectHost } from "./project-host";
import { restoreCanvasProjectDocument } from "./project-restore";
import { createCanvasProjectRestoreState, type CanvasProjectRestoreState } from "./project-restore-state";
import { isCanvasProjectReady, type CanvasProjectLoadIdentity } from "./project-readiness";

export function useCanvasProjectLifecycle({
    projectId,
    hydrated,
    getDocument,
    media,
    navigate,
    onLoadStart,
    onRestore,
}: {
    projectId: string;
    hydrated: boolean;
    getDocument: CanvasProjectHost["getDocument"];
    media: CanvasMediaAdapter;
    navigate: (path: string, options?: { replace?: boolean }) => void;
    onLoadStart: () => void;
    onRestore: (state: CanvasProjectRestoreState) => void;
}) {
    const [loaded, setLoaded] = useState(false);
    const [loadedIdentity, setLoadedIdentity] = useState<CanvasProjectLoadIdentity | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const ready = isCanvasProjectReady(loaded, { projectId, attempt }, loadedIdentity);

    const retry = useCallback(() => {
        setError(null);
        setAttempt((current) => current + 1);
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        setLoaded(false);
        setError(null);
        onLoadStart();
        const controller = new AbortController();
        void restoreCanvasProjectDocument(getDocument, media, projectId, controller.signal).then((project) => {
            if (controller.signal.aborted) return;
            if (!project) {
                navigate("/canvas", { replace: true });
                return;
            }
            onRestore(createCanvasProjectRestoreState(project));
            setLoadedIdentity({ projectId, attempt });
            setLoaded(true);
        }).catch((cause: unknown) => {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "媒体读取失败");
        });
        return () => controller.abort();
    }, [attempt, getDocument, hydrated, media, navigate, onLoadStart, onRestore, projectId]);

    return { ready, loaded, error, attempt, retry };
}
