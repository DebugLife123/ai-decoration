import { describe, expect, test } from "vitest";
import { buildCanvasVideoGenerationMetadata, buildCanvasVideoSettings } from "../src/features/canvas/video-generation-config";

const config = {
    model: "video-model",
    size: "16:9",
    videoSeconds: "8",
    vquality: "1080",
    videoGenerateAudio: "false",
    videoWatermark: "true",
    videoMode: "reference",
} as const;

describe("canvas video generation config", () => {
    test("maps editor preferences to the provider request settings", () => {
        expect(buildCanvasVideoSettings(config)).toEqual({ model: "video-model", size: "16:9", seconds: "8", quality: "1080", generateAudio: "false", watermark: "true", mode: "reference" });
    });

    test("maps the same preferences to node metadata and keeps references optional", () => {
        expect(buildCanvasVideoGenerationMetadata(config)).toEqual({ model: "video-model", size: "16:9", seconds: "8", vquality: "1080", generateAudio: "false", watermark: "true", videoMode: "reference" });
        expect(buildCanvasVideoGenerationMetadata(config, ["asset:reference-1"])).toMatchObject({ ...buildCanvasVideoGenerationMetadata(config), references: ["asset:reference-1"] });
    });
});
