export type CanvasModelCapability = "image" | "video" | "text" | "audio";
export type CanvasGenerationMode = CanvasModelCapability;
export type CanvasModelOption = { value: string; label: string };

export type CanvasGenerationConfig = Pick<CanvasGenerationPreferences,
    "model" | "reasoningEffort" | "quality" | "size" | "background" | "count" |
    "videoSeconds" | "vquality" | "videoGenerateAudio" | "videoWatermark" | "videoMode" |
    "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions"
>;

export type CanvasGenerationPreferences = {
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    modelCapabilities: Record<string, CanvasModelCapability>;
    allModels: CanvasModelOption[];
    models: Record<CanvasModelCapability, CanvasModelOption[]>;
    reasoningEffort: "auto" | "low" | "medium" | "high" | "xhigh";
    quality: string;
    size: string;
    background: string;
    count: string;
    canvasImageCount: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoMode: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
};

export type CanvasGenerationPreferenceSource = Omit<CanvasGenerationPreferences, "modelCapabilities" | "allModels" | "models"> & {
    channels: { id: string; models: { name: string; capability: CanvasModelCapability }[] }[];
};

export const defaultCanvasGenerationPreferences: CanvasGenerationPreferences = {
    model: "default::gpt-image-2",
    imageModel: "default::gpt-image-2",
    videoModel: "default::grok-imagine-video",
    textModel: "default::gpt-5.5",
    audioModel: "default::gpt-4o-mini-tts",
    modelCapabilities: {},
    allModels: [],
    models: { image: [], video: [], text: [], audio: [] },
    reasoningEffort: "auto",
    quality: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "3",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoMode: "frames",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
};

export function buildCanvasGenerationConfig(preferences: CanvasGenerationPreferences, node: { metadata?: object } | undefined, mode: CanvasGenerationMode): CanvasGenerationConfig {
    const metadata = node?.metadata as Record<string, unknown> | undefined;
    const selectedModel = typeof metadata?.model === "string" ? metadata.model : undefined;
    const configuredModel = mode === "image" ? preferences.imageModel : mode === "video" ? preferences.videoModel : mode === "audio" ? preferences.audioModel : preferences.textModel;
    const fallbackModel = defaultCanvasGenerationPreferences[`${mode}Model` as "imageModel" | "videoModel" | "audioModel" | "textModel"];
    const model = selectedModel && preferences.modelCapabilities[selectedModel] === mode
        ? selectedModel
        : preferences.modelCapabilities[configuredModel] === mode ? configuredModel : fallbackModel;
    const read = (key: string, fallback: string) => typeof metadata?.[key] === "string" && metadata[key] ? metadata[key] as string : fallback;
    const storedReasoningEffort = read("reasoningEffort", preferences.reasoningEffort);
    const count = metadata?.count ? String(metadata.count) : mode === "image" ? preferences.canvasImageCount || preferences.count : preferences.count;
    return {
        model,
        reasoningEffort: (["auto", "low", "medium", "high", "xhigh"].includes(storedReasoningEffort) ? storedReasoningEffort : preferences.reasoningEffort) as CanvasGenerationPreferences["reasoningEffort"],
        quality: read("quality", preferences.quality),
        size: read("size", preferences.size),
        background: typeof metadata?.background === "string" ? metadata.background : preferences.background,
        videoSeconds: read("seconds", preferences.videoSeconds),
        vquality: read("vquality", preferences.vquality),
        videoGenerateAudio: read("generateAudio", preferences.videoGenerateAudio),
        videoWatermark: read("watermark", preferences.videoWatermark),
        videoMode: read("videoMode", preferences.videoMode),
        audioVoice: read("audioVoice", preferences.audioVoice),
        audioFormat: read("audioFormat", preferences.audioFormat),
        audioSpeed: read("audioSpeed", preferences.audioSpeed),
        audioInstructions: read("audioInstructions", preferences.audioInstructions),
        count,
    };
}
