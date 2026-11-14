export type CanvasTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};
export type CanvasTextGenerationRequest = { model: string; reasoningEffort: "auto" | "low" | "medium" | "high" | "xhigh"; messages: CanvasTextMessage[]; onDelta?: (text: string) => void };
export type CanvasTextGeneration = {
    execute(request: CanvasTextGenerationRequest, signal?: AbortSignal): Promise<{ text: string }>;
};
