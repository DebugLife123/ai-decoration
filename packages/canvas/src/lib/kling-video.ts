import { modelOptionName, resolveModelRequestConfig, type AiConfig } from "../stores/use-config-store";

export const KLING_REFERENCE_LIMITS = { images: 2 } as const;

export function isKlingVideoModel(model: string) {
    return model.toLowerCase().includes("kling") || model.toLowerCase().includes("可灵");
}

export function isKlingVideoConfig(config: AiConfig | Pick<AiConfig, "model" | "videoModel" | "baseUrl">) {
    const requestConfig = "channels" in config ? resolveModelRequestConfig(config, config.model || config.videoModel) : config;
    return isKlingVideoModel(modelOptionName(requestConfig.model || requestConfig.videoModel));
}

export function normalizeKlingDuration(value: string | number | undefined | null) {
    return Number(value) > 5 ? 10 : 5;
}

export function klingModeFromQuality(value: string | undefined | null) {
    return ["high", "1080", "1080p", "pro"].includes(String(value || "").toLowerCase()) ? "pro" : "std";
}

export function normalizeKlingSize(value: string | undefined | null) {
    const raw = String(value || "");
    if (raw === "1:1" || raw === "1024x1024") return "1024x1024";
    if (raw === "9:16" || raw === "720x1280" || raw === "3:4") return "720x1280";
    return "1280x720";
}

export function klingAspectRatioFromSize(value: string | undefined | null) {
    const size = normalizeKlingSize(value);
    return size === "1024x1024" ? "1:1" : size === "720x1280" ? "9:16" : "16:9";
}
