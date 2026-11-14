import axios from "axios";
import i18n from "../../i18n";
import type { ProviderRequestConfig } from "../../types/provider-request";
import { buildProviderApiUrl, withProviderProxy } from "../../lib/provider-runtime";
import { readImageProviderError } from "./image-errors";

type ImageModelConfig = Pick<ProviderRequestConfig, "baseUrl" | "apiKey" | "apiFormat" | "proxyEnabled" | "proxyUrl">;
type GeminiModelResponse = { models?: Array<{ name?: string }>; error?: { message?: string } };
const apiText = (key: string) => i18n.t(`apiErrors.${key}`);

export async function fetchImageModels(config: ImageModelConfig) {
    try {
        if (config.apiFormat === "gemini") {
            const response = await axios.get<GeminiModelResponse>(geminiModelsUrl(config), { headers: { "x-goog-api-key": config.apiKey } });
            if (response.data.error?.message) throw new Error(response.data.error.message);
            return (response.data.models || []).map((model) => model.name?.replace(/^models\//, "")).filter((id): id is string => Boolean(id)).sort((a, b) => a.localeCompare(b));
        }
        const response = await axios.get<{ data?: Array<{ id?: string }> }>(buildProviderApiUrl(config.baseUrl, "/models", config), { headers: { Authorization: `Bearer ${config.apiKey}` } });
        return (response.data.data || []).map((model) => model.id).filter((id): id is string => Boolean(id)).sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(readImageProviderError(error, apiText("modelReadFailed")));
    }
}

function geminiModelsUrl(config: ImageModelConfig) {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const normalized = /\/v1(?:beta)?$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v1beta`;
    return withProviderProxy(`${normalized}/models`, config);
}
