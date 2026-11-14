export type CanvasAudioSettings = {
    model: string;
    voice: string;
    format: string;
    speed: string;
    instructions: string;
};

export type CanvasAudioRequest = {
    projectId: string;
    prompt: string;
    settings: CanvasAudioSettings;
};

export type CanvasAudioGeneration = {
    execute(request: CanvasAudioRequest, signal: AbortSignal): Promise<Blob>;
};
