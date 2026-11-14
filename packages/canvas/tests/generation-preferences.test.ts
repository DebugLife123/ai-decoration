import { expect, test } from "vitest";
import { buildCanvasGenerationConfig, defaultCanvasGenerationPreferences, type CanvasGenerationPreferences } from "../src/features/canvas/generation-preferences";

const preferences: CanvasGenerationPreferences = {
    ...defaultCanvasGenerationPreferences,
    model: "design::image-model",
    imageModel: "design::image-model",
    models: {
        image: [{ value: "design::image-model", label: "Image model" }],
        video: [{ value: "design::video-model", label: "Video model" }],
        text: [],
        audio: [],
    },
    modelCapabilities: { "design::image-model": "image", "design::video-model": "video" },
    allModels: [{ value: "design::image-model", label: "Image model" }, { value: "design::video-model", label: "Video model" }],
};

test("generation config uses a node model only when it matches the requested capability", () => {
    expect(buildCanvasGenerationConfig(preferences, { metadata: { model: "design::video-model", size: "9:16", count: 4 } }, "video")).toMatchObject({ model: "design::video-model", size: "9:16", count: "4" });
    expect(buildCanvasGenerationConfig(preferences, { metadata: { model: "design::video-model" } }, "image").model).toBe("design::image-model");
});

test("generation config preserves configured capability defaults and per-node overrides", () => {
    expect(buildCanvasGenerationConfig(preferences, { metadata: { seconds: "12", generateAudio: "false", background: "transparent" } }, "video")).toMatchObject({ model: "default::grok-imagine-video", videoSeconds: "12", videoGenerateAudio: "false", background: "transparent" });
    expect(buildCanvasGenerationConfig(preferences, undefined, "image")).toMatchObject({ model: "design::image-model", count: "3", quality: "auto", size: "1:1" });
});

test("invalid persisted reasoning effort falls back to the host preference", () => {
    expect(buildCanvasGenerationConfig(preferences, { metadata: { reasoningEffort: "secret-value" } }, "text").reasoningEffort).toBe("auto");
});

test("canvas generation config exposes only public generation settings", () => {
    const config = buildCanvasGenerationConfig(preferences, undefined, "image");
    expect(config).not.toHaveProperty("apiKey");
    expect(config).not.toHaveProperty("baseUrl");
    expect(config).not.toHaveProperty("channels");
    expect(config).not.toHaveProperty("models");
    expect(config).not.toHaveProperty("modelCapabilities");
    expect(preferences.models.image.map(({ value }) => value)).toEqual(["design::image-model"]);
});
