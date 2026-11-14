import { resolveModelRequestConfig, resolveModelScript, useConfigStore, type AiConfig, type ModelChannel } from "../../stores/use-config-store";
import type { ImageInputOptions } from "./image-input";
import { readRequestImage } from "./image-input";
import { requestResolvedEdit, requestResolvedGeneration } from "./image-execution";
import { requestResolvedImageQuestion, type AiTextMessage } from "./image-question";
import { fetchImageModels } from "./image-models";
import type { ReferenceImage } from "../../types/image";

type RequestOptions = { signal?: AbortSignal };

export function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions) {
    const model = config.model || config.imageModel;
    return requestResolvedGeneration(resolveModelRequestConfig(config, model), resolveModelScript(config, model), prompt, options);
}

export function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], options?: ImageInputOptions) {
    const model = config.model || config.imageModel;
    const resolvedOptions = { ...options, readImage: options?.readImage || ((image: ReferenceImage) => readRequestImage(image, options)) };
    return requestResolvedEdit(resolveModelRequestConfig(config, model), resolveModelScript(config, model), prompt, references, resolvedOptions);
}

export function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    const model = config.model || config.textModel;
    return requestResolvedImageQuestion(resolveModelRequestConfig(config, model), resolveModelScript(config, model), messages, onDelta, options);
}

export function fetchChannelModels(channel: ModelChannel) {
    const { proxyEnabled, proxyUrl } = useConfigStore.getState().config;
    return fetchImageModels({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, apiFormat: channel.apiFormat, proxyEnabled, proxyUrl });
}

export { fetchImageModels } from "./image-models";
