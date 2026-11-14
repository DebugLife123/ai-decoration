import { useCallback, useMemo, type MutableRefObject } from "react";
import type { Position } from "../../types/canvas";
import { importCanvasFileAsNode, resolveCanvasFileImportFailures, runCanvasFileImportBatch, runCanvasImportPlan, type CanvasFileImportHost, type CanvasFileImportBatchItem, type CanvasFileReplacementResult, type CanvasImportedFileNode } from "./file-import";
import type { CanvasImportPlan, CanvasFileKind } from "./file-import-policy";

export function useCanvasFileImport({
    host,
    scopeRef,
    createId,
    onNodeImported,
    isCanceled,
    onFailure,
}: {
    host: CanvasFileImportHost;
    scopeRef: MutableRefObject<AbortController>;
    createId: (kind: CanvasFileKind) => string;
    onNodeImported: (result: Awaited<ReturnType<typeof importCanvasFileAsNode>>) => void;
    isCanceled: (reason: unknown) => boolean;
    onFailure: (message: string) => void;
}) {
    const { projectId, mode, importImage, importVideo, importAudio } = host;
    const importHost = useMemo(() => ({ projectId, mode, importImage, importVideo, importAudio }), [importAudio, importImage, importVideo, mode, projectId]);
    const importFileNode = useCallback(async (file: File, position: Position) => {
        const result = await importCanvasFileAsNode(importHost, file, position, createId, scopeRef.current.signal);
        onNodeImported(result);
    }, [createId, importHost, onNodeImported, scopeRef]);

    const importFileBatch = useCallback(async (items: CanvasFileImportBatchItem[]) => {
        const results = await runCanvasFileImportBatch(items, importFileNode);
        resolveCanvasFileImportFailures(results, isCanceled, "素材导入失败").forEach(({ fileName, message }) => onFailure(`${fileName}：${message}`));
    }, [importFileNode, isCanceled, onFailure]);

    const runImportPlan = useCallback(async (plan: CanvasImportPlan, onReplacement?: (result: CanvasFileReplacementResult) => void) => {
        const result = await runCanvasImportPlan(plan, importHost, importFileNode, scopeRef.current.signal, onReplacement);
        resolveCanvasFileImportFailures(result.items, isCanceled, "素材导入失败").forEach(({ fileName, message }) => onFailure(`${fileName}：${message}`));
        return result;
    }, [importHost, importFileNode, isCanceled, onFailure, scopeRef]);

    return { importFileNode, importFileBatch, runImportPlan };
}
