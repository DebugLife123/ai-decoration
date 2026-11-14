import { beforeEach, expect, test, vi } from "vitest";
import { canvasGenerationPreferences, createLocalCanvasTextGeneration } from "../../../web/src/services/api/canvas/generation-preferences";
import type { AiConfig } from "../src/stores/use-config-store";

const mocks = vi.hoisted(() => ({ requestText: vi.fn(), resolve: vi.fn() }));
vi.mock("../../../web/src/stores/use-config-store", () => ({ encodeChannelModel: (channel: string, model: string) => `${channel}::${model}` }));
vi.mock("@infinite-canvas/core/provider/image-question", () => ({ requestResolvedImageQuestion: mocks.requestText }));
vi.mock("../../../web/src/services/api/canvas/provider-model", () => ({ resolveLocalCanvasProviderRequest: mocks.resolve }));

const config = {
    model: "design::image-model", imageModel: "design::image-model", videoModel: "design::video-model", textModel: "design::text-model", audioModel: "design::audio-model",
    channels: [{ id: "design", apiKey: "nested channel key", baseUrl: "https://channel-private.invalid", models: [{ name: "image-model", capability: "image", script: "private image script", apiKey: "nested model key" }, { name: "video-model", capability: "video" }, { name: "text-model", capability: "text" }, { name: "audio-model", capability: "audio" }] }],
    reasoningEffort: "high", quality: "high", size: "16:9", background: "", count: "1", canvasImageCount: "4", videoSeconds: "8", vquality: "1080", videoGenerateAudio: "false", videoWatermark: "true", videoMode: "reference", audioVoice: "alloy", audioFormat: "mp3", audioSpeed: "1", audioInstructions: "", apiKey: "private key", baseUrl: "https://private.invalid", proxyUrl: "private proxy", systemPrompt: "private system prompt",
} as AiConfig;

beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolve.mockReturnValue({ requestConfig: { model: "text-model", apiKey: "internal" }, script: "text script" });
});

test("host preferences expose model labels and capabilities but never credentials or scripts", () => {
    const preferences = canvasGenerationPreferences(config);
    expect(preferences.models.image).toEqual([{ value: "design::image-model", label: "image-model" }]);
    expect(preferences.models.video[0].value).toBe("design::video-model");
    expect(preferences.allModels.map((model) => model.value)).toEqual(config.channels[0].models.map((model) => `design::${model.name}`));
    expect(JSON.stringify(preferences)).not.toContain("private key");
    expect(JSON.stringify(preferences)).not.toContain("nested channel key");
    expect(JSON.stringify(preferences)).not.toContain("nested model key");
    expect(JSON.stringify(preferences)).not.toContain("private.invalid");
    expect(JSON.stringify(preferences)).not.toContain("private proxy");
    expect(JSON.stringify(preferences)).not.toContain("private system prompt");
    expect(JSON.stringify(preferences)).not.toContain("private image script");
});

test("host text provider preserves model settings, multimodal messages, streaming and cancellation", async () => {
    mocks.requestText.mockResolvedValue("response");
    const adapter = createLocalCanvasTextGeneration(config);
    const signal = new AbortController().signal;
    const onDelta = vi.fn();
    const messages = [{ role: "user" as const, content: [{ type: "text" as const, text: "hello" }, { type: "image_url" as const, image_url: { url: "data:image/png;base64,fixture" } }] }];
    await expect(adapter.execute({ model: "design::text-model", reasoningEffort: "high", messages, onDelta }, signal)).resolves.toEqual({ text: "response" });
    expect(mocks.resolve).toHaveBeenCalledWith({ ...config, model: "design::text-model", reasoningEffort: "high" }, "design::text-model");
    expect(mocks.requestText).toHaveBeenCalledWith({ model: "text-model", apiKey: "internal" }, "text script", messages, expect.any(Function), { signal });
    const delta = mocks.requestText.mock.calls[0][3] as (text: string) => void;
    delta("partial");
    expect(onDelta).toHaveBeenCalledWith("partial");
});

test("canceled plugin text requests do not invoke the provider", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createLocalCanvasTextGeneration(config).execute({ model: "design::text-model", reasoningEffort: "auto", messages: [{ role: "user", content: "hello" }] }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.requestText).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
});
