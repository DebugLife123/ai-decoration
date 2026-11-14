import type { ChannelCompatProfile } from "../lib/channel-compat";

export type ProviderCapability = "image" | "video" | "text" | "audio";

export type ProviderRequestConfig = {
    model: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: "openai" | "gemini";
    compatProfile: ChannelCompatProfile;
    proxyEnabled: boolean;
    proxyUrl: string;
    systemPrompt: string;
    reasoningEffort: "auto" | "low" | "medium" | "high" | "xhigh";
    quality: string;
    size: string;
    background: string;
    count: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoMode: string;
};
