import i18n from "../../i18n";
import { buildProviderApiUrl, withProviderProxy } from "../../lib/provider-runtime";
import { runModelPlugin } from "./model-plugin";
import { readImageProviderError } from "./image-errors";
import { requestImageQuestionStream } from "./image-question-stream";
import type { ProviderRequestConfig } from "../../types/provider-request";

export type AiTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type InputMessage = AiTextMessage | { type: "function_call"; call_id: string; name: string; arguments: string; thoughtSignature?: string } | { role: "tool"; tool_call_id: string; content: string };
type ResponseContent = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };
type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string }; fileData?: { mimeType: string; fileUri: string }; functionCall?: { id: string; name: string; args: Record<string, unknown> }; functionResponse?: { id: string; name: string; response: { result: unknown } }; thoughtSignature?: string };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type RequestOptions = { signal?: AbortSignal };

const apiText = (key: string) => i18n.t(`apiErrors.${key}`);

function withSystemMessage(config: ProviderRequestConfig, messages: AiTextMessage[]): InputMessage[] {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;
}

function toResponseInput(messages: InputMessage[]) {
    const input: unknown[] = [];
    for (const message of messages) {
        if ("type" in message) {
            input.push(message);
            continue;
        }
        if (message.role === "tool") {
            input.push({ type: "function_call_output", call_id: message.tool_call_id, output: message.content });
            continue;
        }
        const content = message.content || "";
        input.push({ role: message.role, content: Array.isArray(content) ? content.map((item) => item.type === "text" ? { type: "input_text", text: item.text } : { type: "input_image", image_url: item.image_url.url }) : String(content) });
    }
    return input;
}

function jsonValue(value: string): unknown {
    try { return JSON.parse(value); } catch { return value; }
}

function toGeminiParts(content: AiTextMessage["content"]): GeminiPart[] {
    if (!Array.isArray(content)) return [{ text: String(content || "") }];
    return content.map((item) => {
        if (item.type === "text") return { text: item.text };
        const url = item.image_url.url;
        const dataUrl = url.match(/^data:([^;,]+);base64,(.+)$/);
        return dataUrl ? { inlineData: { mimeType: dataUrl[1], data: dataUrl[2] } } : { fileData: { fileUri: url, mimeType: "image/png" } };
    });
}

function toGeminiBody(config: ProviderRequestConfig, messages: InputMessage[]) {
    const systemText = [config.systemPrompt.trim(), ...messages.flatMap((message) => !("type" in message) && message.role === "system" ? [Array.isArray(message.content) ? message.content.map((item) => item.type === "text" ? item.text : item.image_url.url).join("\n") : String(message.content || "")] : [])].filter(Boolean).join("\n\n");
    const callNameById = new Map<string, string>();
    const contents: GeminiContent[] = messages.filter((message) => "type" in message || message.role !== "system").flatMap((message) => {
        if ("type" in message) {
            callNameById.set(message.call_id, message.name);
            let args: Record<string, unknown> = {};
            const parsed = jsonValue(message.arguments);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
            return [{ role: "model", parts: [{ functionCall: { id: message.call_id, name: message.name, args }, ...(message.thoughtSignature ? { thoughtSignature: message.thoughtSignature } : {}) }] }];
        }
        if (message.role === "tool") return [{ role: "user", parts: [{ functionResponse: { id: message.tool_call_id, name: callNameById.get(message.tool_call_id) || "tool_result", response: { result: jsonValue(message.content) } } }] }];
        return [{ role: message.role === "assistant" ? "model" : "user", parts: toGeminiParts(message.content) }];
    });
    return { contents, ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}) };
}

function proxy(config: Pick<ProviderRequestConfig, "proxyEnabled" | "proxyUrl">) {
    return { proxyEnabled: config.proxyEnabled, proxyUrl: config.proxyUrl };
}

function openAiUrl(config: ProviderRequestConfig) {
    return buildProviderApiUrl(config.baseUrl, "/responses", proxy(config));
}

function geminiUrl(config: ProviderRequestConfig) {
    const base = config.baseUrl.trim().replace(/\/+$/, "");
    const versioned = /\/v1(?:beta)?$/i.test(base) ? base : `${base}/v1beta`;
    const model = config.model.trim().replace(/^models\//, "");
    return withProviderProxy(`${versioned}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, proxy(config));
}

export async function requestResolvedImageQuestion(config: ProviderRequestConfig, script: string, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    if (script) {
        try {
            const answer = await runModelPlugin<string>({ capability: "text", script, config, messages: withSystemMessage(config, messages), signal: options?.signal, onDelta });
            const text = String(answer ?? "").trim() || apiText("noContent");
            if (text === apiText("noContent")) onDelta(text);
            return text;
        } catch (error) {
            throw new Error(readImageProviderError(error, apiText("requestFailed")));
        }
    }

    try {
        const gemini = config.apiFormat === "gemini";
        const body = gemini
            ? toGeminiBody(config, messages)
            : { model: config.model, input: toResponseInput(withSystemMessage(config, messages)), ...(config.reasoningEffort === "auto" ? {} : { reasoning: { effort: config.reasoningEffort } }) };
        const headers: Record<string, string> = gemini
            ? { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" }
            : { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" };
        const result = await requestImageQuestionStream(gemini ? "gemini" : "openai", gemini ? geminiUrl(config) : openAiUrl(config), headers, body, onDelta, options);
        const text = result.content || apiText("noContent");
        if (text === apiText("noContent")) onDelta(text);
        return text;
    } catch (error) {
        throw new Error(readImageProviderError(error, apiText("requestFailed")));
    }
}
