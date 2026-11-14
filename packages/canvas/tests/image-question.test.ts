import { afterEach, expect, test, vi } from "vitest";
import { requestResolvedImageQuestion, type AiTextMessage } from "@infinite-canvas/core/provider/image-question";
import { requestResolvedImageQuestion as legacyRequestImageQuestion } from "../src/services/api/image-execution";
import type { ProviderRequestConfig } from "../src/types/provider-request";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

afterEach(() => vi.unstubAllGlobals());

test("legacy image execution path re-exports the dedicated question entry", () => {
    expect(legacyRequestImageQuestion).toBe(requestResolvedImageQuestion);
});

test("resolved image question keeps provider URL, auth, prompt and streaming contract", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"Answer"}\n\ndata: {"type":"response.completed","response":{"output_text":"Answer"}}\n\n'));
            controller.close();
        },
    })));
    vi.stubGlobal("fetch", fetch);
    const config = {
        model: "fixture-model", baseUrl: "https://provider.example/v1", apiKey: "fixture-key", apiFormat: "openai", compatProfile: {},
        proxyEnabled: false, proxyUrl: "", systemPrompt: "Be concise", reasoningEffort: "low", quality: "standard", size: "auto", background: "",
        count: "1", audioVoice: "", audioFormat: "", audioSpeed: "1", audioInstructions: "", videoSeconds: "5", vquality: "standard",
        videoGenerateAudio: "false", videoWatermark: "false", videoMode: "text",
    } as ProviderRequestConfig;
    const messages: AiTextMessage[] = [{ role: "user", content: "Describe this room" }];
    const deltas: string[] = [];

    await expect(requestResolvedImageQuestion(config, "", messages, (text) => deltas.push(text))).resolves.toBe("Answer");

    expect(deltas).toEqual(["Answer"]);
    expect(fetch).toHaveBeenCalledWith("https://provider.example/v1/responses", expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fixture-key", Accept: "text/event-stream" }),
        body: JSON.stringify({ model: "fixture-model", input: [{ role: "system", content: "Be concise" }, { role: "user", content: "Describe this room" }], reasoning: { effort: "low" }, stream: true }),
    }));
});

test("Gemini question uses the model stream endpoint and multimodal message format", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"Room"}]}}]}\n\n')); controller.close(); } })));
    vi.stubGlobal("fetch", fetch);
    const config = {
        model: "models/gemini-test", baseUrl: "https://generativelanguage.googleapis.com", apiKey: "fixture-key", apiFormat: "gemini", compatProfile: {},
        proxyEnabled: false, proxyUrl: "", systemPrompt: "", reasoningEffort: "auto", quality: "standard", size: "auto", background: "", count: "1",
        audioVoice: "", audioFormat: "", audioSpeed: "1", audioInstructions: "", videoSeconds: "5", vquality: "standard", videoGenerateAudio: "false",
        videoWatermark: "false", videoMode: "text",
    } as ProviderRequestConfig;
    const messages: AiTextMessage[] = [{ role: "user", content: [{ type: "text", text: "Describe" }, { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }] }];

    await expect(requestResolvedImageQuestion(config, "", messages, () => undefined)).resolves.toBe("Room");
    expect(fetch).toHaveBeenCalledWith("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse", expect.objectContaining({
        headers: { "x-goog-api-key": "fixture-key", "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Describe" }, { inlineData: { mimeType: "image/png", data: "AA==" } }] }] }),
    }));
});
