import type { CanvasGenerationConfig } from "./generation-preferences";
import type { CanvasNodeMetadata } from "../../types/canvas";
import type { CanvasVideoSettings } from "./video-generation";

type VideoConfig = Pick<CanvasGenerationConfig, "model" | "size" | "videoSeconds" | "vquality" | "videoGenerateAudio" | "videoWatermark" | "videoMode">;

export function buildCanvasVideoSettings(config: VideoConfig): CanvasVideoSettings {
    return {
        model: config.model,
        size: config.size,
        seconds: config.videoSeconds,
        quality: config.vquality,
        generateAudio: config.videoGenerateAudio,
        watermark: config.videoWatermark,
        mode: config.videoMode,
    };
}

export function buildCanvasVideoGenerationMetadata(config: VideoConfig, references?: string[]): CanvasNodeMetadata {
    return {
        model: config.model,
        size: config.size,
        seconds: config.videoSeconds,
        vquality: config.vquality,
        generateAudio: config.videoGenerateAudio,
        watermark: config.videoWatermark,
        videoMode: config.videoMode,
        ...(references ? { references } : {}),
    };
}
