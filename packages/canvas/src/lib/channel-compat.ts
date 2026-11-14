export type ChannelCompatProfile = "auto" | "openai" | "openai-slim" | "grok-image" | "relay-fragile";

export const CHANNEL_COMPAT_PROFILES: readonly ChannelCompatProfile[] = ["auto", "openai", "openai-slim", "grok-image", "relay-fragile"];

export type ImageCompatStrategy = {
    profile: Exclude<ChannelCompatProfile, "auto">;
    sizeMode: "openai-size" | "grok-aspect" | "omit";
    includeQuality: boolean;
    includeOutputFormat: boolean;
    includeBackground: boolean;
    retrySlimOnError: boolean;
    editFallbackFragile: boolean;
};

export function normalizeChannelCompatProfile(value: unknown): ChannelCompatProfile {
    return CHANNEL_COMPAT_PROFILES.includes(value as ChannelCompatProfile) ? (value as ChannelCompatProfile) : "auto";
}

export function resolveChannelCompatProfile(baseUrl: string, profile?: ChannelCompatProfile | null): Exclude<ChannelCompatProfile, "auto"> {
    const explicit = normalizeChannelCompatProfile(profile);
    if (explicit !== "auto") return explicit;
    const value = (baseUrl || "").trim().toLowerCase();
    if (value.includes("/lan-ai")) return "grok-image";
    if (value.includes("codex2api") || value.includes("chatgpt2api") || value.includes("openai2api.com")) return "relay-fragile";
    return "openai";
}

export function getImageCompatStrategy(baseUrl: string, profile?: ChannelCompatProfile | null): ImageCompatStrategy {
    const resolved = resolveChannelCompatProfile(baseUrl, profile);
    if (resolved === "grok-image") {
        return { profile: resolved, sizeMode: "grok-aspect", includeQuality: false, includeOutputFormat: false, includeBackground: false, retrySlimOnError: true, editFallbackFragile: false };
    }
    if (resolved === "relay-fragile") {
        return { profile: resolved, sizeMode: "openai-size", includeQuality: true, includeOutputFormat: false, includeBackground: true, retrySlimOnError: true, editFallbackFragile: true };
    }
    if (resolved === "openai-slim") {
        return { profile: resolved, sizeMode: "openai-size", includeQuality: true, includeOutputFormat: false, includeBackground: true, retrySlimOnError: true, editFallbackFragile: false };
    }
    return { profile: "openai", sizeMode: "openai-size", includeQuality: true, includeOutputFormat: true, includeBackground: true, retrySlimOnError: false, editFallbackFragile: false };
}
