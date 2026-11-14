import { isGrokModelTask } from "./grok-model-profile";
import { isCodex2apiBaseUrl, isXaiBaseUrl } from "./grok-video";

export type AudioHostProfile = { kind: "codex2api" | "xai" | "openai-compatible"; ttsPath: string; nativeGrokVoice: boolean };

export function resolveAudioHostProfile(baseUrl: string): AudioHostProfile {
    if (isCodex2apiBaseUrl(baseUrl)) return { kind: "codex2api", ttsPath: "/tts", nativeGrokVoice: true };
    if (isXaiBaseUrl(baseUrl)) return { kind: "xai", ttsPath: "/tts", nativeGrokVoice: true };
    return { kind: "openai-compatible", ttsPath: "/audio/speech", nativeGrokVoice: false };
}

export function usesNativeGrokVoiceApi(baseUrl: string, model: string) {
    return resolveAudioHostProfile(baseUrl).nativeGrokVoice && isGrokModelTask(model, "tts");
}

export function normalizeGrokVoiceId(value: string) {
    const voices = ["Eve", "Ara", "Rex", "Sal", "Leo"];
    return voices.find((voice) => voice.toLowerCase() === value.trim().toLowerCase()) || "Ara";
}

export function inferGrokTtsLanguage(text: string) {
    if (/[?-?]/u.test(text)) return "ja";
    if (/[?-?]/u.test(text)) return "ko";
    if (/[?-?]/u.test(text)) return "zh";
    return "en";
}
