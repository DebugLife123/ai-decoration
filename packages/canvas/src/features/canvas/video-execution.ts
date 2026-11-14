import type { CanvasImportedVideo, CanvasVideoImporter } from "./contracts";
import { importCanvasResultVideo } from "../../services/api/canvas/result-media";
import type { CanvasMediaAdapter } from "./media";
import type { CanvasVideoGeneration, CanvasVideoProviderHandle, CanvasVideoSettings } from "./video-generation";
import type { ReferenceImage } from "../../types/image";
import type { ReferenceAudio, ReferenceVideo } from "../../types/media";

export type CanvasVideoExecutionInput = {
    projectId: string;
    prompt: string;
    settings: CanvasVideoSettings;
    references: ReferenceImage[];
    videos?: ReferenceVideo[];
    audios?: ReferenceAudio[];
    signal: AbortSignal;
    generation: CanvasVideoGeneration | undefined;
    media: CanvasMediaAdapter;
    importVideo: CanvasVideoImporter | undefined;
    name: string;
    onTaskCreated?: (task: CanvasVideoProviderHandle) => void;
};

export async function executeCanvasVideoTask(input: CanvasVideoExecutionInput): Promise<CanvasImportedVideo> {
    const { projectId, prompt, settings, references, videos = [], audios = [], signal, generation, media, importVideo, name } = input;
    signal.throwIfAborted();
    if (!importVideo) throw new Error("当前宿主不支持视频导入");
    if (!generation) throw new Error("当前宿主不支持视频生成");
    const task = await generation.create({ projectId, prompt, settings, references, videos, audios }, signal);
    signal.throwIfAborted();
    input.onTaskCreated?.(task);
    const result = await generation.wait({ projectId, settings }, task, signal);
    const video = await importCanvasResultVideo(media, importVideo, projectId, result, name, signal);
    return video;
}

export async function resumeCanvasVideoTask({ projectId, settings, handle, signal, generation, media, importVideo, name }: Omit<CanvasVideoExecutionInput, "prompt" | "references" | "videos" | "audios" | "onTaskCreated"> & { handle: CanvasVideoProviderHandle }): Promise<CanvasImportedVideo> {
    signal.throwIfAborted();
    if (!importVideo) throw new Error("当前宿主不支持视频导入");
    if (!generation) throw new Error("当前宿主不支持视频生成");
    const result = await generation.wait({ projectId, settings }, handle, signal);
    return importCanvasResultVideo(media, importVideo, projectId, result, name, signal);
}
