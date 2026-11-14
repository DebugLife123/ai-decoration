import { modelOptionName } from "../stores/use-config-store";

export function isSeedanceVideoModel(model: string) {
    return model.toLowerCase().includes("seedance") || model.toLowerCase().includes("doubao-seedance");
}

export function isSeedanceOpenAiVideoModel(model: string) {
    const name = modelOptionName(model).trim().toLowerCase();
    return name === "seedance2" || name === "seedance2.5";
}

export function isArkPlanBaseUrl(baseUrl: string) {
    return baseUrl.toLowerCase().includes("ark.cn-beijing.volces.com/api/plan/v3") || baseUrl.toLowerCase().includes("/api/plan/v3");
}

export function normalizeSeedanceDuration(value: string) {
    const seconds = Math.floor(Number(value) || 5);
    return Math.max(4, Math.min(15, seconds));
}

export function normalizeSeedanceRatio(value: string) {
    return ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"].includes(value) ? value : "adaptive";
}

export function normalizeSeedanceResolution(value: string) {
    const raw = String(value || "720").toLowerCase().replace(/p$/i, "");
    return raw === "480" ? "480p" : raw === "1080" ? "1080p" : "720p";
}
