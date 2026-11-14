import { useEffect, useMemo, type MutableRefObject } from "react";
import type { CanvasBackgroundMode } from "../../lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../../types/canvas";
import type { CanvasProjectDocument } from "./contracts";
import { createCanvasAutosaveDocument, isCanvasProjectSaveScopeCurrent, type CanvasProjectSaveScope } from "./project-save";
import { createCanvasViewportSaveScheduler, saveCanvasViewportSnapshot } from "./viewport-save";

export type CanvasProjectHistoryBaseline = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

export type CanvasProjectPersistenceRefs = {
    projectDocument: MutableRefObject<CanvasProjectDocument | null>;
    projectSaveScope: MutableRefObject<CanvasProjectSaveScope>;
    hostVersionId: MutableRefObject<string | null>;
    historyBaseline: MutableRefObject<CanvasProjectHistoryBaseline | null>;
    viewport: MutableRefObject<ViewportTransform>;
    historyPaused: MutableRefObject<boolean>;
};

export function useCanvasProjectPersistence({
    projectId,
    projectLoadAttempt,
    projectReady,
    saveDocument,
    nodes,
    connections,
    chatSessions,
    activeChatId,
    backgroundMode,
    showImageInfo,
    viewport,
    refs,
    onError,
}: {
    projectId: string;
    projectLoadAttempt: number;
    projectReady: boolean;
    saveDocument: (projectId: string, document: CanvasProjectDocument) => Promise<void>;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    refs: CanvasProjectPersistenceRefs;
    onError: (kind: "document" | "viewport", error: unknown) => void;
}) {
    const scheduler = useMemo(createCanvasViewportSaveScheduler, []);
    const { projectDocument, projectSaveScope, hostVersionId, historyBaseline, viewport: viewportRef, historyPaused } = refs;

    useEffect(() => {
        if (!projectReady || historyPaused.current) return;
        const previous = historyBaseline.current;
        const canvasChanged = Boolean(previous && (previous.nodes !== nodes || previous.connections !== connections || previous.backgroundMode !== backgroundMode || previous.showImageInfo !== showImageInfo));
        historyBaseline.current = { nodes, connections, backgroundMode, showImageInfo };
        const currentHostVersionId = hostVersionId.current;
        const document = createCanvasAutosaveDocument({
            projectId, nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo,
            viewport: viewportRef.current,
        }, { hostVersionId: currentHostVersionId, canvasChanged, previousVersionId: projectDocument.current?.currentVersionId || null });
        projectDocument.current = document;
        const scope = { projectId, projectLoadAttempt };
        void saveDocument(projectId, document).then(() => {
            if (!isCanvasProjectSaveScopeCurrent(scope, projectSaveScope.current)) return;
            if (hostVersionId.current === currentHostVersionId) hostVersionId.current = null;
        }).catch((error: unknown) => {
            if (isCanvasProjectSaveScopeCurrent(scope, projectSaveScope.current)) onError("document", error);
        });
    }, [activeChatId, backgroundMode, chatSessions, connections, historyBaseline, historyPaused, hostVersionId, nodes, onError, projectDocument, projectId, projectLoadAttempt, projectReady, projectSaveScope, saveDocument, showImageInfo, viewportRef]);

    useEffect(() => {
        if (!projectReady) return;
        const scope = { projectId, projectLoadAttempt };
        scheduler.schedule(() => void saveCanvasViewportSnapshot({
            projectId,
            scope,
            isScopeCurrent: (candidate) => isCanvasProjectSaveScopeCurrent(candidate, projectSaveScope.current),
            readDocument: () => projectDocument.current,
            readViewport: () => viewportRef.current,
            writeDocument: (document) => { projectDocument.current = document; },
            saveDocument,
            onError: (error) => onError("viewport", error),
        }));
        return () => scheduler.cancel();
    }, [onError, projectDocument, projectId, projectLoadAttempt, projectReady, projectSaveScope, saveDocument, scheduler, viewport, viewportRef]);
}
