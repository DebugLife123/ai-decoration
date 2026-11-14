import { expect, test } from "vitest";
import { createLocalCanvasProviderModelResolver, resolveLocalCanvasProviderRequest } from "../../../web/src/services/api/canvas/provider-model";
import type { AiConfig } from "../src/stores/use-config-store";

const config = {
    channelMode: "remote",
    baseUrl: "https://fallback.invalid",
    apiKey: "fallback-secret",
    apiFormat: "openai",
    model: "studio::room-image",
    imageModel: "studio::room-image",
    videoModel: "studio::room-video",
    textModel: "studio::room-text",
    audioModel: "studio::room-audio",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoMode: "frames",
    systemPrompt: "host-only prompt",
    reasoningEffort: "auto",
    models: ["studio::room-image"],
    quality: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "3",
    proxyEnabled: false,
    proxyUrl: "http://127.0.0.1:23210",
    unrelatedHostSetting: "omit me",
    channels: [{
        id: "studio", name: "Studio", apiKey: "private-key", baseUrl: "https://private.invalid", apiFormat: "gemini", compatProfile: "openai",
        models: [
            { name: "room-image", capability: "image", script: "private script with nested secret" },
            { name: "room-video", capability: "video" },
            { name: "room-audio", capability: "audio" },
            { name: "room-text", capability: "text" },
        ],
    }],
} as unknown as AiConfig;

test("local resolver returns only allowlisted model execution metadata", () => {
    const resolve = createLocalCanvasProviderModelResolver(config);
    expect(resolve("studio::room-image")).toEqual({ model: "room-image", capability: "image", apiFormat: "gemini", compatProfile: "openai", hasScript: true });
    expect(JSON.stringify(resolve("studio::room-image"))).not.toContain("private");
    expect(resolve("missing::room-image")).toBeNull();
    expect(resolve("studio::room-video")).toEqual({ model: "room-video", capability: "video", apiFormat: "gemini", compatProfile: "openai", hasScript: false });
});

test("Canvas request config resolves credentials and script only inside the web host", () => {
    const result = resolveLocalCanvasProviderRequest(config, "studio::room-image");
    expect(result.requestConfig).toEqual({
        model: "room-image", apiKey: "private-key", baseUrl: "https://private.invalid", apiFormat: "gemini", compatProfile: "openai",
        proxyEnabled: false, proxyUrl: "http://127.0.0.1:23210", systemPrompt: "host-only prompt", reasoningEffort: "auto",
        quality: "auto", size: "1:1", background: "", count: "1", audioVoice: "alloy", audioFormat: "mp3", audioSpeed: "1",
        audioInstructions: "", videoSeconds: "6", vquality: "720", videoGenerateAudio: "true", videoWatermark: "false", videoMode: "frames",
    });
    expect(result.requestConfig).not.toHaveProperty("channels");
    expect(result.requestConfig).not.toHaveProperty("canvasImageCount");
    expect(result.requestConfig).not.toHaveProperty("unrelatedHostSetting");
    expect(result.script).toBe("private script with nested secret");
});

