import type { CanvasMediaReference } from "../../../features/canvas/media";
import type { ImageInputOptions } from "../image-input";

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = {
    id: string;
    provider: "openai" | "gemini" | "grok" | "seedance" | "kling" | "agnes" | "plugin";
    model: string;
    requestModel?: string;
    requestedResolution?: string;
    acceptedResolution?: string;
    readyResult?: VideoGenerationResult;
};
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };
export type RequestOptions = { signal?: AbortSignal };
export type VideoMediaOptions = ImageInputOptions & {
    videos?: CanvasMediaReference[];
    audios?: CanvasMediaReference[];
    readMedia?: (reference: CanvasMediaReference) => Promise<Blob>;
};
export type ResolvedVideoMediaOptions = Omit<VideoMediaOptions, "readImage" | "readMedia"> & {
    readImage: NonNullable<ImageInputOptions["readImage"]>;
    readMedia: NonNullable<VideoMediaOptions["readMedia"]>;
};
