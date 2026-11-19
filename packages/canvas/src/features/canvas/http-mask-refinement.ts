import type { CanvasMaskRefinement, CanvasMaskRefinementRequest, CanvasMaskRefinementResult } from "./mask-refinement";

export type CanvasHttpMaskRefinementOptions = {
    fetch?: typeof globalThis.fetch;
    url?: string;
    buildBody?: (request: CanvasMaskRefinementRequest) => Record<string, unknown>;
};

type MaskRefinementResponse = {
    maskDataUrl?: string;
    maskUrl?: string;
    bounds?: CanvasMaskRefinementResult["bounds"];
    error?: string;
    detail?: string;
};

export function createCanvasHttpMaskRefinement(options: CanvasHttpMaskRefinementOptions = {}): CanvasMaskRefinement {
    const requestFetch = options.fetch || globalThis.fetch;
    const url = options.url || "/api/ai/refine-mask";
    return {
        async execute(request, signal) {
            signal.throwIfAborted();
            const response = await requestFetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(options.buildBody ? options.buildBody(request) : {
                    projectId: request.projectId,
                    image: request.imageDataUrl,
                    mask: request.maskDataUrl,
                    positiveMask: request.positiveMaskDataUrl,
                    negativeMask: request.negativeMaskDataUrl,
                    output: "mask",
                }),
                signal,
            });
            const payload = await response.json() as MaskRefinementResponse;
            if (!response.ok) throw new Error(payload.error || payload.detail || `遮罩完善服务请求失败（HTTP ${response.status}）`);
            const maskDataUrl = payload.maskDataUrl || payload.maskUrl;
            if (!maskDataUrl) throw new Error(payload.error || "遮罩完善服务未返回 mask");
            return {
                maskDataUrl,
                ...(payload.bounds ? { bounds: payload.bounds } : {}),
            };
        },
    };
}
