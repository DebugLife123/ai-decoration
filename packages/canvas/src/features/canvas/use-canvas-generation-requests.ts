import { useCallback, useLayoutEffect, useState } from "react";
import { createCanvasGenerationRequestRegistry } from "./generation-request-registry";

export function useCanvasGenerationRequests(projectId: string) {
    const [requests] = useState(createCanvasGenerationRequestRegistry);
    const startGenerationRequest = useCallback((targetNodeId: string, originNodeId: string, runningId = originNodeId, controller = new AbortController()) => requests.start(targetNodeId, originNodeId, runningId, controller), [requests]);
    const finishGenerationRequest = useCallback((targetNodeId: string, controller: AbortController) => requests.finish(targetNodeId, controller), [requests]);
    const stopGenerationRequests = useCallback((runningId: string) => requests.stopByRunningId(runningId), [requests]);

    useLayoutEffect(() => () => requests.abortAll(), [projectId, requests]);

    return { requests, startGenerationRequest, finishGenerationRequest, stopGenerationRequests };
}
