import { describe, expect, test } from "vitest";
import { buildCanvasAudioGenerationMetadata, buildCanvasAudioSettings } from "../src/features/canvas/audio-generation-config";

const config = {
    model: "audio-model",
    audioVoice: "alloy",
    audioFormat: "wav",
    audioSpeed: "1.2",
    audioInstructions: "温暖自然",
} as const;

describe("canvas audio generation config", () => {
    test("maps editor preferences to provider settings", () => {
        expect(buildCanvasAudioSettings(config)).toEqual({ model: "audio-model", voice: "alloy", format: "wav", speed: "1.2", instructions: "温暖自然" });
    });

    test("maps editor preferences to node metadata", () => {
        expect(buildCanvasAudioGenerationMetadata(config)).toEqual({ model: "audio-model", audioVoice: "alloy", audioFormat: "wav", audioSpeed: "1.2", audioInstructions: "温暖自然" });
    });
});
