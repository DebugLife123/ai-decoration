import type { CanvasImageGeneration, CanvasImageRequest } from "./image-generation";

export type CanvasHttpImageGenerationOptions = {
    fetch?: typeof globalThis.fetch;
    generateUrl?: string;
    editUrl?: string;
    buildBody?: (request: CanvasImageRequest) => Record<string, unknown>;
    pollJob?: (jobId: string, request: CanvasImageRequest, signal: AbortSignal) => Promise<string>;
};

type CanvasImageResponse = { dataUrl?: string; imageUrl?: string; jobId?: string; error?: string };

export function createCanvasHttpImageGeneration(options: CanvasHttpImageGenerationOptions = {}): CanvasImageGeneration {
    const requestFetch = options.fetch || globalThis.fetch;
    const generateUrl = options.generateUrl || "/api/ai/generate";
    const editUrl = options.editUrl || "/api/ai/edit-room-image";
    return {
        async execute(request, signal) {
            signal.throwIfAborted();
            const response = await requestFetch(request.operation === "edit" ? editUrl : generateUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(options.buildBody ? options.buildBody(request) : defaultBody(request)),
                signal,
            });
            const payload = await response.json() as CanvasImageResponse;
            if (!response.ok) throw new Error(payload.error || `图像服务请求失败（HTTP ${response.status}）`);
            const immediateResult = payload.dataUrl || payload.imageUrl;
            if (immediateResult) return { dataUrl: immediateResult };
            if (payload.jobId && options.pollJob) return { dataUrl: await options.pollJob(payload.jobId, request, signal) };
            throw new Error(payload.jobId ? "图像任务已创建，但宿主未配置任务查询器" : payload.error || "图像服务未返回结果");
        },
    };
}

function defaultBody(request: CanvasImageRequest) {
    const references = request.references;
    return request.operation === "edit"
        ? { image: references[0]?.dataUrl, mask: references[1]?.dataUrl, instruction: request.prompt, roomName: "画布空间", style: "modern" }
        : { mode: "photo", style: "modern", prompt: request.prompt, photo: references[0]?.dataUrl };
}
