import type { ReferenceImage } from "../../types/image";
import type { ReferenceAudio, ReferenceVideo } from "../../types/media";
import type { CanvasVideoProvider, CanvasVideoTaskHandle } from "../../types/canvas";
import type { ChannelCompatProfile } from "../../lib/channel-compat";
import type { CanvasModelCapability } from "./generation-preferences";

export type CanvasVideoResult = { blob?: Blob; url?: string; mimeType?: string };

export type CanvasVideoSettings = {
    model: string;
    size: string;
    seconds: string;
    quality: string;
    generateAudio: string;
    watermark: string;
    mode: string;
};

// This is the legacy provider handle persisted on video nodes, not the unified task contract.
export type CanvasVideoProviderHandle = {
    id: string;
    provider: CanvasVideoProvider | "plugin";
    model: string;
};

export type { CanvasVideoTaskHandle };

export type CanvasVideoRequest = {
    projectId: string;
    prompt: string;
    settings: CanvasVideoSettings;
    references: ReferenceImage[];
    videos: ReferenceVideo[];
    audios: ReferenceAudio[];
};

// Host-owned, credential-free model metadata used before provider execution.
export type CanvasProviderModelResolution = {
    model: string;
    capability: CanvasModelCapability;
    apiFormat: "openai" | "gemini";
    compatProfile: ChannelCompatProfile;
    hasScript: boolean;
};

export type CanvasProviderModelResolver = (model: string) => CanvasProviderModelResolution | null;

export type CanvasVideoGeneration = {
    create(request: CanvasVideoRequest, signal: AbortSignal): Promise<CanvasVideoProviderHandle>;
    wait(request: Pick<CanvasVideoRequest, "projectId" | "settings">, handle: CanvasVideoProviderHandle, signal: AbortSignal): Promise<CanvasVideoResult>;
};
