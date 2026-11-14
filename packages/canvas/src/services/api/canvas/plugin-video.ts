import type { CanvasVideoImporter } from "../../../features/canvas/contracts";
import { readCanvasReferenceImages, type CanvasMediaAdapter } from "../../../features/canvas/media";
import type { CanvasVideoGeneration, CanvasVideoSettings } from "../../../features/canvas/video-generation";
import type { GenerateVideoResult } from "../../../types/canvas-plugin";
import type { ReferenceImage } from "../../../types/image";
import { importCanvasResultVideo } from "./result-media";

export async function generateCanvasPluginVideo(media: CanvasMediaAdapter, projectId: string, importVideo: CanvasVideoImporter | undefined, videoGeneration: CanvasVideoGeneration | undefined, settings: CanvasVideoSettings, prompt: string, references: ReferenceImage[], signal: AbortSignal): Promise<GenerateVideoResult> {
    signal.throwIfAborted();
    if (!importVideo) throw new Error("当前宿主不支持视频导入");
    if (!videoGeneration) throw new Error("当前宿主不支持视频生成");
    const images = await readCanvasReferenceImages(media, projectId, references, signal);
    const request = { projectId, prompt, settings, references: images, videos: [], audios: [] };
    const handle = await videoGeneration.create(request, signal);
    signal.throwIfAborted();
    const result = await videoGeneration.wait(request, handle, signal);
    const asset = await importCanvasResultVideo(media, importVideo, projectId, result, "plugin-video.mp4", signal);
    return { url: asset.url, mimeType: asset.mimeType, width: asset.width, height: asset.height, durationMs: asset.durationMs };
}
