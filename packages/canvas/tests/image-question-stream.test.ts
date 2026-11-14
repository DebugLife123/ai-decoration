import { afterEach, expect, test, vi } from "vitest";
import { requestImageQuestionStream } from "../src/services/api/image-question-stream";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

afterEach(() => vi.unstubAllGlobals());

function eventStream(...events: unknown[]) {
    const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); } }));
}

test("OpenAI Responses stream returns incremental text and forwards cancellation", async () => {
    const fetch = vi.fn().mockResolvedValue(eventStream(
        { type: "response.output_text.delta", delta: "Hello" },
        { type: "response.completed", response: { output_text: "Hello" } },
    ));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const deltas: string[] = [];

    await expect(requestImageQuestionStream("openai", "/responses", { Accept: "text/event-stream" }, { model: "fixture" }, (text) => deltas.push(text), { signal: controller.signal }))
        .resolves.toMatchObject({ content: "Hello" });

    expect(deltas).toEqual(["Hello"]);
    expect(fetch).toHaveBeenCalledWith("/responses", expect.objectContaining({ signal: controller.signal, body: JSON.stringify({ model: "fixture", stream: true }) }));
});

test("Gemini stream reports provider errors from events", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(eventStream({ error: { message: "fixture denied" } })));
    await expect(requestImageQuestionStream("gemini", "/stream", {}, {}, () => undefined)).rejects.toThrow("fixture denied");
});

test("Gemini stream emits accumulated text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(eventStream(
        { candidates: [{ content: { parts: [{ text: "Hi" }] } }] },
        { candidates: [{ content: { parts: [{ text: " there" }] } }] },
    )));
    const deltas: string[] = [];
    await expect(requestImageQuestionStream("gemini", "/stream", {}, {}, (text) => deltas.push(text))).resolves.toMatchObject({ content: "Hi there" });
    expect(deltas).toEqual(["Hi", "Hi there"]);
});
