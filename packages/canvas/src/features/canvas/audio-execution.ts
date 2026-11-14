import { importCanvasResultAudio } from "../../services/api/canvas/result-media";
import type { CanvasImportedAudio, CanvasAudioImporter } from "./contracts";
import type { CanvasAudioGeneration, CanvasAudioSettings } from "./audio-generation";

export async function executeCanvasAudioTask({ projectId, prompt, settings, signal, generation, importAudio, name }: {
    projectId: string;
    prompt: string;
    settings: CanvasAudioSettings;
    signal: AbortSignal;
    generation: CanvasAudioGeneration | undefined;
    importAudio: CanvasAudioImporter | undefined;
    name: string;
}): Promise<CanvasImportedAudio> {
    signal.throwIfAborted();
    if (!importAudio) throw new Error("当前宿主不支持音频导入");
    if (!generation) throw new Error("当前宿主不支持音频生成");
    const result = await generation.execute({ projectId, prompt, settings }, signal);
    return importCanvasResultAudio(importAudio, projectId, result, name, settings.format, signal);
}
