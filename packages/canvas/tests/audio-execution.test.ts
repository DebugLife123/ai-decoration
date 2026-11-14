import axios from "axios";
import { beforeEach, expect, test, vi } from "vitest";
import { requestResolvedAudioGeneration } from "../src/services/api/audio-execution";
import type { ProviderRequestConfig } from "../src/types/provider-request";

vi.mock("axios", () => ({ default: { post: vi.fn(), isAxiosError: () => false, isCancel: () => false } }));
vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

const post = vi.mocked(axios.post);
const config: ProviderRequestConfig = {
    model: "tts-model", baseUrl: "https://provider.invalid", apiKey: "host-secret", apiFormat: "openai", compatProfile: "auto",
    proxyEnabled: true, proxyUrl: "http://127.0.0.1:23210", systemPrompt: "", reasoningEffort: "auto", quality: "auto", size: "1:1",
    background: "", count: "1", audioVoice: "alloy", audioFormat: "mp3", audioSpeed: "1.25", audioInstructions: "clear voice",
    videoSeconds: "6", vquality: "720", videoGenerateAudio: "true", videoWatermark: "false", videoMode: "frames",
};

beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: new Blob(["audio"], { type: "audio/mpeg" }) });
});

test("audio execution uses only the request DTO and applies its explicit proxy settings", async () => {
    const controller = new AbortController();
    await expect(requestResolvedAudioGeneration(config, "", "Room ambience", { signal: controller.signal })).resolves.toMatchObject({ type: "audio/mpeg" });
    expect(post).toHaveBeenCalledWith(
        "http://127.0.0.1:23210/https://provider.invalid/v1/audio/speech",
        { model: "tts-model", input: "Room ambience", voice: "alloy", response_format: "mp3", speed: 1.25, instructions: "clear voice" },
        expect.objectContaining({ signal: controller.signal, responseType: "blob", headers: expect.objectContaining({ Authorization: "Bearer host-secret" }) }),
    );
});

test("audio execution rejects Gemini channels before making a request", async () => {
    await expect(requestResolvedAudioGeneration({ ...config, apiFormat: "gemini" }, "", "Room ambience")).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
});
