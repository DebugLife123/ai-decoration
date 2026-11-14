import type { CanvasGenerationConfig } from "./generation-preferences";
import type { CanvasNodeMetadata } from "../../types/canvas";
import type { CanvasAudioSettings } from "./audio-generation";

type AudioConfig = Pick<CanvasGenerationConfig, "model" | "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions">;

export function buildCanvasAudioSettings(config: AudioConfig): CanvasAudioSettings {
    return {
        model: config.model,
        voice: config.audioVoice,
        format: config.audioFormat,
        speed: config.audioSpeed,
        instructions: config.audioInstructions,
    };
}

export function buildCanvasAudioGenerationMetadata(config: AudioConfig): CanvasNodeMetadata {
    return {
        model: config.model,
        audioVoice: config.audioVoice,
        audioFormat: config.audioFormat,
        audioSpeed: config.audioSpeed,
        audioInstructions: config.audioInstructions,
    };
}
