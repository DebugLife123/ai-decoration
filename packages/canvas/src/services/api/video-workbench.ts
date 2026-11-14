import { readProviderMedia } from "../provider-media-persistence";
import { resolveModelRequestConfig, resolveModelScript, type AiConfig } from "../../stores/use-config-store";
import { readRequestImage } from "./image-input";
import { createResolvedVideoGenerationTask, pollResolvedVideoGenerationTask, waitForResolvedVideoGenerationTask } from "./video";
import type { RequestOptions, VideoGenerationResult, VideoGenerationTask, VideoGenerationTaskState, VideoMediaOptions } from "./video/types";
import type { ReferenceImage } from "../../types/image";

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationResult> {
    return waitForVideoGenerationTask(config, await createVideoGenerationTask(config, prompt, references, options), options);
}

export async function waitForVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationResult> {
    return waitForResolvedVideoGenerationTask(resolveModelRequestConfig(config, task.model), task, options);
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    return createResolvedVideoGenerationTask(requestConfig, selectedModel, resolveModelScript(config, selectedModel), prompt, references, {
        ...options,
        readImage: options?.readImage || ((image) => readRequestImage(image, { signal: options?.signal })),
        readMedia: options?.readMedia || ((reference) => readProviderMedia(reference, options?.signal)),
    });
}

export function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    return pollResolvedVideoGenerationTask(resolveModelRequestConfig(config, task.model), task, options);
}
