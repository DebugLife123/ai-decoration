import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasVersionDocument } from "../../features/canvas/contracts";
import type { CanvasMediaAdapter } from "../../features/canvas/media";
import type { CanvasVersionHost } from "../../features/canvas/project-host";
import { loadCanvasVersionPreview } from "../../features/canvas/version-preview";
import { selectCanvasVersionId } from "../../features/canvas/version-selection";
import type { CanvasNodeData } from "../../types/canvas";

const EMPTY_VERSIONS: CanvasVersionDocument[] = [];

export function useCanvasVersionHistory({
    open,
    projectId,
    media,
    versionHost,
    onLoadError,
}: {
    open: boolean;
    projectId: string;
    media: CanvasMediaAdapter;
    versionHost: CanvasVersionHost;
    onLoadError: (error: unknown) => void;
}) {
    const subscribe = useCallback((listener: () => void) => versionHost.subscribe(projectId, listener), [projectId, versionHost]);
    const getSnapshot = useCallback(() => versionHost.getSnapshot(projectId), [projectId, versionHost]);
    const versionSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const versions = versionSnapshot.versions || EMPTY_VERSIONS;
    const [selectedVersionId, setSelectedVersionId] = useState("");
    const [previewNodes, setPreviewNodes] = useState<CanvasNodeData[]>([]);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(false);
    const [previewRetry, setPreviewRetry] = useState(0);
    const selectedVersion = versions.find((version) => version.versionId === selectedVersionId) || null;

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        void versionHost.loadVersions(projectId, controller.signal).catch((error: unknown) => {
            if (!controller.signal.aborted) onLoadError(error);
        });
        return () => controller.abort();
    }, [onLoadError, open, projectId, versionHost]);

    useEffect(() => {
        if (!open) return;
        setSelectedVersionId(selectCanvasVersionId(versions, versionSnapshot.currentVersionId));
    }, [open, versionSnapshot.currentVersionId, versions]);

    useEffect(() => {
        if (!open || !selectedVersion) {
            setPreviewNodes([]);
            setPreviewLoading(false);
            setPreviewError(false);
            return;
        }
        const controller = new AbortController();
        let active = true;
        setPreviewLoading(true);
        setPreviewError(false);
        void loadCanvasVersionPreview(media, projectId, selectedVersion, controller.signal)
            .then((restored) => {
                if (active && !controller.signal.aborted) setPreviewNodes(restored);
            })
            .catch(() => {
                if (active && !controller.signal.aborted) {
                    setPreviewNodes([]);
                    setPreviewError(true);
                }
            })
            .finally(() => {
                if (active) setPreviewLoading(false);
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [media, open, previewRetry, projectId, selectedVersion?.versionId]);

    return {
        versions,
        currentVersionId: versionSnapshot.currentVersionId,
        selectedVersion,
        selectedVersionId,
        setSelectedVersionId,
        previewNodes,
        previewLoading,
        previewError,
        retryPreview: () => setPreviewRetry((value) => value + 1),
    };
}
