import { readCanvasReferenceMedia, type CanvasMediaAdapter } from "../../../features/canvas/media";
import type { AiConfig } from "../../../stores/use-config-store";
import type { ProviderRequestConfig } from "../../../types/provider-request";
import type { ReferenceImage } from "../../../types/image";
import { createResolvedVideoGenerationTask } from "../video";
import { createVideoGenerationTask } from "../video-workbench";
import type { VideoMediaOptions } from "../video/types";

export async function createCanvasVideoTask(media: CanvasMediaAdapter, projectId: string, config: AiConfig, prompt: string, images: ReferenceImage[], options: Omit<VideoMediaOptions, "readMedia" | "readImage"> & { signal: AbortSignal }) {
    options.signal.throwIfAborted();
    // Providers retain validation and encoding; only the host resolves media bytes.
    const task = await createVideoGenerationTask(config, prompt, images, {
        ...options,
        // Image references have already been materialized by the canvas host.
        readImage: async (image) => image.dataUrl,
        readMedia: (reference) => readCanvasReferenceMedia(media, projectId, reference, options.signal),
    });
    options.signal.throwIfAborted();
    return task;
}

export async function createResolvedCanvasVideoTask(media: CanvasMediaAdapter, projectId: string, config: ProviderRequestConfig, model: string, script: string, prompt: string, images: ReferenceImage[], options: Omit<VideoMediaOptions, "readMedia" | "readImage"> & { signal: AbortSignal }) {
    options.signal.throwIfAborted();
    const task = await createResolvedVideoGenerationTask(config, model, script, prompt, images, {
        ...options,
        readImage: async (image) => image.dataUrl,
        readMedia: (reference) => readCanvasReferenceMedia(media, projectId, reference, options.signal),
    });
    options.signal.throwIfAborted();
    return task;
}
