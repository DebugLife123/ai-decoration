export type CanvasGenerationRequest = {
    targetNodeId: string;
    originNodeId: string;
    runningNodeId: string;
    controller: AbortController;
};

export type CanvasGenerationRequestRegistry = ReturnType<typeof createCanvasGenerationRequestRegistry>;

export function createCanvasGenerationRequestRegistry() {
    const requests = new Map<string, CanvasGenerationRequest>();

    return {
        has(targetNodeId: string) {
            return requests.has(targetNodeId);
        },
        start(targetNodeId: string, originNodeId: string, runningNodeId = originNodeId, controller = new AbortController()) {
            const previous = requests.get(targetNodeId);
            if (previous?.controller !== controller) previous?.controller.abort();
            requests.set(targetNodeId, { targetNodeId, originNodeId, runningNodeId, controller });
            return controller;
        },
        finish(targetNodeId: string, controller: AbortController) {
            const request = requests.get(targetNodeId);
            if (request?.controller === controller) requests.delete(targetNodeId);
        },
        stopByRunningId(runningNodeId: string) {
            const affectedNodeIds = new Set<string>();
            requests.forEach((request) => {
                if (request.runningNodeId !== runningNodeId) return;
                request.controller.abort();
                requests.delete(request.targetNodeId);
                affectedNodeIds.add(request.targetNodeId);
                affectedNodeIds.add(request.originNodeId);
            });
            return affectedNodeIds;
        },
        abortAll() {
            requests.forEach(({ controller }) => controller.abort());
            requests.clear();
        },
    };
}
