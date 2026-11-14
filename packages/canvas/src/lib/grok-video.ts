import { isGrokModelTask, resolveGrokModelProfile } from "./grok-model-profile";
import { modelOptionName, resolveModelRequestConfig, type AiConfig } from "../stores/use-config-store";

export function isGrokVideoConfig(config: AiConfig | Pick<AiConfig, "model" | "videoModel" | "baseUrl">) {
    const requestConfig = "channels" in config ? resolveModelRequestConfig(config, config.model || config.videoModel) : config;
    return isGrokVideoModel(modelOptionName(requestConfig.model || requestConfig.videoModel));
}

export function isGrokVideoModel(model: string) {
    const value = model.toLowerCase();
    const profile = resolveGrokModelProfile(value);
    return profile ? isGrokModelTask(value, "video") : value.includes("grok") && value.includes("video");
}

export function isXaiBaseUrl(baseUrl: string) {
    return baseUrl.toLowerCase().includes("api.x.ai");
}

export function isCodex2apiBaseUrl(baseUrl: string) {
    return baseUrl.toLowerCase().includes("codex2api");
}

export function isOpenAI2ApiBaseUrl(baseUrl: string) {
    const value = baseUrl.toLowerCase();
    return value.includes("openai2api.com") || /(^|[/.])openai2api([/.:]|$)/i.test(value);
}

export function normalizeGrokDuration(value: string) {
    const seconds = String(value ?? "").trim();
    const number = seconds === "" || !Number.isFinite(Number(seconds)) ? 8 : Math.floor(Number(seconds));
    return Math.max(1, Math.min(15, number));
}

export function normalizeGrokResolution(value: string) {
    const raw = String(value || "720").toLowerCase().replace(/p$/i, "");
    if (raw === "low" || raw === "480") return "480p";
    if (raw === "high" || raw === "1080") return "1080p";
    return "720p";
}

export function normalizeGrokAspectRatio(value: string) {
    if (["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(value)) return value;
    const match = value.match(/^(\d+)x(\d+)$/);
    if (!match) return "16:9";
    const ratio = Number(match[1]) / Number(match[2]);
    const candidates = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] as const;
    return candidates.reduce((best, current) => {
        const [width, height] = current.split(":").map(Number);
        const bestRatio = best.split(":").map(Number);
        return Math.abs(width / height - ratio) < Math.abs(bestRatio[0] / bestRatio[1] - ratio) ? current : best;
    }, "16:9" as (typeof candidates)[number]);
}
