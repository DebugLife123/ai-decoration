import { resolveModelRequestConfig, resolveModelScript, type AiConfig } from "../../stores/use-config-store";
import { requestResolvedAudioGeneration } from "./audio-execution";

type RequestOptions = { signal?: AbortSignal };

export { requestResolvedAudioGeneration } from "./audio-execution";

export function requestAudioGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<Blob> {
    const selectedModel = config.model || config.audioModel;
    return requestResolvedAudioGeneration(resolveModelRequestConfig(config, selectedModel), resolveModelScript(config, selectedModel), prompt, options);
}
