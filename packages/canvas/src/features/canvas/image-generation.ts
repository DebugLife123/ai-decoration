import type { ReferenceImage } from "../../types/image";

export type CanvasImageSettings = { model: string; quality: string; size: string; background: string };
export type CanvasImageInput = Pick<ReferenceImage, "id" | "name" | "type" | "dataUrl">;
export type CanvasImageRequest = {
    projectId: string;
    operation: "generate" | "edit";
    editIntent?: "edit" | "fill";
    prompt: string;
    settings: CanvasImageSettings;
    references: CanvasImageInput[];
};
export type CanvasImageGeneration = {
    execute(request: CanvasImageRequest, signal: AbortSignal): Promise<{ dataUrl: string }>;
};

export type CanvasPluginImageRequest = Omit<CanvasImageRequest, "settings"> & {
    settings: CanvasImageSettings & { count: number };
};
export type CanvasPluginImageGeneration = {
    execute(request: CanvasPluginImageRequest, signal: AbortSignal): Promise<{ dataUrls: string[] }>;
};

// This synchronous-result port is not the queued task API and returns no asset/task identity.
export async function generateCanvasImage(adapter: CanvasImageGeneration | undefined, request: CanvasImageRequest, signal: AbortSignal) {
    signal.throwIfAborted();
    if (!adapter) throw new Error("当前项目尚未配置图片生成服务，请先完成服务配置");
    const { model, quality, size, background } = request.settings;
    const result = await adapter.execute({
        projectId: request.projectId, operation: request.operation, ...(request.editIntent ? { editIntent: request.editIntent } : {}), prompt: request.prompt,
        settings: { model, quality, size, background },
        references: request.references.map(({ id, name, type, dataUrl }) => ({ id, name, type, dataUrl })),
    }, signal);
    signal.throwIfAborted();
    if (!result?.dataUrl) throw new Error("图片生成未返回可读取的结果");
    return result;
}
