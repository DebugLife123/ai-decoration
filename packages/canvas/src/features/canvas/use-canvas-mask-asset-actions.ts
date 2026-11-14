import { useCallback, type MutableRefObject } from "react";
import type { CanvasNodeData } from "../../types/canvas";
import { createMaskImageNode } from "./mask-image";
import type { CanvasImageImporter } from "./contracts";
import type { CanvasAbortableOperation } from "./use-canvas-project-operation-scopes";

export function useCanvasMaskAssetActions({
    importImage,
    projectId,
    maskRequest,
    isSourcePresent,
    onSourceMissing,
    onBusyChange,
    onError,
}: {
    importImage: CanvasImageImporter;
    projectId: string;
    maskRequest: MutableRefObject<CanvasAbortableOperation | null>;
    isSourcePresent: (nodeId: string) => boolean;
    onSourceMissing: () => void;
    onBusyChange: (busy: boolean) => void;
    onError: (error: unknown) => void;
}) {
    return useCallback(async (source: CanvasNodeData, maskDataUrl: string, title: string): Promise<CanvasNodeData | null> => {
        if (!source.metadata?.content || maskRequest.current) return null;
        const request = { controller: new AbortController() };
        maskRequest.current = request;
        onBusyChange(true);
        try {
            const node = await createMaskImageNode(importImage, projectId, source, maskDataUrl, title, request.controller.signal);
            if (maskRequest.current !== request) return null;
            if (!isSourcePresent(source.id)) {
                onSourceMissing();
                return null;
            }
            return node;
        } catch (error) {
            if (maskRequest.current === request && !request.controller.signal.aborted) onError(error);
            return null;
        } finally {
            if (maskRequest.current === request) {
                maskRequest.current = null;
                onBusyChange(false);
            }
        }
    }, [importImage, isSourcePresent, maskRequest, onBusyChange, onError, onSourceMissing, projectId]);
}
