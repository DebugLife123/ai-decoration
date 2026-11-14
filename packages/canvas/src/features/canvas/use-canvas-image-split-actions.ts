import { useCallback, type MutableRefObject } from "react";
import type { CanvasImageSplitParams } from "../../components/canvas/canvas-node-split-dialog";
import type { CanvasNodeData } from "../../types/canvas";
import { prepareImageSplit, saveImageSplit, type CanvasSplitBatch } from "./split-image";
import type { CanvasImageImporter } from "./contracts";

export function useCanvasImageSplitActions({
    importImage,
    projectId,
    splitRequest,
    splitBatch,
    isSourcePresent,
    onSaved,
    onSourceMissing,
    onBusyChange,
    onError,
}: {
    importImage: CanvasImageImporter;
    projectId: string;
    splitRequest: MutableRefObject<symbol | null>;
    splitBatch: CanvasSplitBatch | null;
    isSourcePresent: (nodeId: string) => boolean;
    onSaved: (source: CanvasNodeData, previous: CanvasSplitBatch, result: CanvasSplitBatch) => void;
    onSourceMissing: (source: CanvasNodeData, result: CanvasSplitBatch) => void;
    onBusyChange: (busy: boolean) => void;
    onError: (error: unknown) => void;
}) {
    return useCallback(async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
        if (splitRequest.current) return;
        const request = Symbol();
        splitRequest.current = request;
        onBusyChange(true);
        try {
            const batch = splitBatch || await prepareImageSplit(projectId, node, params);
            if (splitRequest.current !== request) return;
            const result = await saveImageSplit(importImage, batch);
            if (splitRequest.current !== request) return;
            if (!isSourcePresent(node.id)) onSourceMissing(node, result);
            else onSaved(node, batch, result);
        } catch (error) {
            if (splitRequest.current === request) onError(error);
        } finally {
            if (splitRequest.current === request) {
                splitRequest.current = null;
                onBusyChange(false);
            }
        }
    }, [importImage, isSourcePresent, onBusyChange, onError, onSaved, onSourceMissing, projectId, splitBatch, splitRequest]);
}
