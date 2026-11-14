import i18n from "../../i18n";
import type { ProviderRequestConfig } from "../../types/provider-request";
import { nanoid } from "nanoid";
import { readImageProviderFetchError } from "./image-errors";
import { splitSseFrames } from "./sse";

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string }; thoughtSignature?: string };
type ToolResponseResult = { content: string; toolCalls: ToolCall[] };
type ResponseOutputItem = { type?: "message"; content?: Array<{ type?: string; text?: string }> } | { type?: "function_call"; id?: string; call_id?: string; name?: string; arguments?: string };
type ResponsePayload = { output?: ResponseOutputItem[]; output_text?: string; error?: { message?: string }; code?: number; msg?: string };
type GeminiPart = { text?: string; functionCall?: { id?: string; name?: string; args?: Record<string, unknown> }; thoughtSignature?: string; thought_signature?: string };
type GeminiPayload = { candidates?: Array<{ content?: { parts?: GeminiPart[] } }>; error?: { message?: string }; promptFeedback?: { blockReason?: string } };
type StreamOptions = { signal?: AbortSignal };

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export async function requestImageQuestionStream(
    apiFormat: ProviderRequestConfig["apiFormat"],
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    onDelta: (text: string) => void,
    options?: StreamOptions,
): Promise<ToolResponseResult> {
    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(apiFormat === "openai" ? { ...body, stream: true } : body),
        signal: options?.signal,
    });
    if (!response.ok) throw new Error(readImageProviderFetchError(response.status, await response.text(), apiText("requestFailed")));
    if (!response.body) {
        const payload = apiFormat === "gemini" ? ((await response.json()) as GeminiPayload) : ((await response.json()) as ResponsePayload);
        return apiFormat === "gemini" ? parseGeminiResult(payload as GeminiPayload) : parseResponseResult(payload as ResponsePayload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let payload: ResponsePayload | undefined;
    const toolCalls: ToolCall[] = [];
    for (;;) {
        const { done, value } = await reader.read();
        const frames = splitSseFrames(buffer, done ? decoder.decode() : decoder.decode(value, { stream: true }), done);
        buffer = frames.buffer;
        for (const frame of frames.frames) {
            const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n").trim();
            if (!data || data === "[DONE]") continue;
            const event = JSON.parse(data) as Record<string, unknown>;
            if (apiFormat === "gemini") {
                const result = parseGeminiResult(event as GeminiPayload);
                if (result.content) {
                    text += result.content;
                    onDelta(text);
                }
                toolCalls.push(...result.toolCalls);
                continue;
            }
            const error = responseErrorMessage(event);
            if (error) throw new Error(error);
            if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
                text += event.delta;
                onDelta(text);
            }
            if (event.type === "response.output_text.done" && !text && typeof event.text === "string") {
                text = event.text;
                onDelta(text);
            }
            if (event.type === "response.completed" && isRecord(event.response)) payload = event.response as ResponsePayload;
            else if (Array.isArray(event.output)) payload = event as ResponsePayload;
        }
        if (done) break;
    }
    if (apiFormat === "gemini") return { content: text, toolCalls };
    if (!payload) return { content: text, toolCalls: [] };
    validateResponse(payload);
    const result = parseResponseResult(payload);
    return { ...result, content: text || result.content };
}

function parseResponseResult(payload: ResponsePayload): ToolResponseResult {
    validateResponse(payload);
    const output = payload.output || [];
    const content = payload.output_text || output.flatMap((item) => (item.type === "message" ? item.content || [] : [])).map((item) => item.text || "").join("");
    const toolCalls = output
        .filter((item): item is Extract<ResponseOutputItem, { type?: "function_call" }> => item.type === "function_call")
        .map((item) => ({ id: item.call_id || item.id || "", type: "function" as const, function: { name: item.name || "", arguments: item.arguments || "{}" } }))
        .filter((item) => item.id && item.function.name);
    return { content, toolCalls };
}

function parseGeminiResult(payload: GeminiPayload): ToolResponseResult {
    if (payload.error?.message) throw new Error(payload.error.message);
    if (payload.promptFeedback?.blockReason) throw new Error(apiText("geminiRejected", { reason: payload.promptFeedback.blockReason }));
    const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    return {
        content: parts.map((part) => part.text || "").join(""),
        toolCalls: parts
            .filter((part) => Boolean(part.functionCall?.name))
            .map((part) => ({
                id: part.functionCall?.id || nanoid(),
                type: "function" as const,
                function: { name: part.functionCall?.name || "", arguments: JSON.stringify(part.functionCall?.args || {}) },
                ...((part.thoughtSignature || part.thought_signature) ? { thoughtSignature: part.thoughtSignature || part.thought_signature } : {}),
            })),
    };
}

function validateResponse(payload: ResponsePayload) {
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || apiText("requestFailed"));
    if (payload.error?.message) throw new Error(payload.error.message);
}

function responseErrorMessage(value: unknown) {
    if (!isRecord(value)) return "";
    const error = isRecord(value.error) ? value.error : undefined;
    const response = isRecord(value.response) ? value.response : undefined;
    const responseError = response && isRecord(response.error) ? response.error : undefined;
    return stringValue(value.msg) || stringValue(error?.message) || stringValue(responseError?.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}
