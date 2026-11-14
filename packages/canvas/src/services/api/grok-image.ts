import axios from "axios";
import { nanoid } from "nanoid";

import { isGrokModelTask } from "../../lib/grok-model-profile";
import { buildProviderApiUrl, modelOptionName } from "../../lib/provider-runtime";
import type { ProviderRequestConfig } from "../../types/provider-request";
import { readHostImage, type ResolvedImageInputOptions } from "./image-read";
import type { ReferenceImage } from "../../types/image";

type ImageResult = { id: string; dataUrl: string };
type ImagePayload = { data?: Array<Record<string, unknown>>; images?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>>; code?: number | string; msg?: string; message?: string; error?: { message?: string } };

export function isGrokImageModel(model: string) {
    return isGrokModelTask(model, "image-generation", "image-edit");
}

export async function requestGrokImageGeneration(config: ProviderRequestConfig, prompt: string, count: number, options?: { signal?: AbortSignal }): Promise<ImageResult[]> {
    const body = { model: modelOptionName(config.model), prompt, n: count, response_format: "b64_json", aspect_ratio: grokAspectRatio(config.size), resolution: grokResolution(config.quality, config.size) };
    try {
        const response = await axios.post<ImagePayload>(apiUrl(config), body, { headers: headers(config), signal: options?.signal, timeout: 180000 });
        return parseImages(response.data);
    } catch (error) {
        throw new Error(readError(error, "Grok 图片生成失败"));
    }
}

export async function requestGrokImageEdit(config: ProviderRequestConfig, prompt: string, references: ReferenceImage[], count: number, options: ResolvedImageInputOptions): Promise<ImageResult[]> {
    if (!references.length) throw new Error("Grok 图片编辑至少需要一张参考图");
    const images = await Promise.all(references.map((image) => readHostImage(image, options)));
    const common = { model: modelOptionName(config.model), prompt, n: Math.min(count, 4), response_format: "b64_json", aspect_ratio: grokAspectRatio(config.size), resolution: grokResolution(config.quality, config.size) };
    const candidates = images.length === 1
        ? [{ ...common, image: { url: images[0] } }, { ...common, image: images[0] }]
        : [{ ...common, images: images.map((url) => ({ url })) }, { ...common, images }];
    let lastError: unknown;
    for (const body of candidates) {
        try {
            const response = await axios.post<ImagePayload>(apiUrl(config, "/images/edits"), body, { headers: headers(config), signal: options?.signal, timeout: 180000 });
            return parseImages(response.data);
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(readError(lastError, "Grok 图片编辑失败"));
}

function apiUrl(config: ProviderRequestConfig, path = "/images/generations") {
    return buildProviderApiUrl(config.baseUrl, path, config);
}

function headers(config: ProviderRequestConfig) {
    return { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
}

function parseImages(payload: ImagePayload) {
    if (payload.code !== undefined && ![0, "0", 200, "200"].includes(payload.code)) throw new Error(payload.msg || payload.message || payload.error?.message || "Grok 图片接口返回错误");
    const items = payload.data || payload.images || payload.results || [];
    const images = items.map((item) => {
        if (typeof item.b64_json === "string") return `data:image/png;base64,${item.b64_json}`;
        return typeof item.url === "string" ? item.url : "";
    }).filter(Boolean).map((dataUrl) => ({ id: nanoid(), dataUrl }));
    if (!images.length) throw new Error("Grok 图片接口没有返回图片");
    return images;
}

function grokAspectRatio(size: string) {
    if (/^\d+:\d+$/.test(size)) return size;
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) return "1:1";
    return `${match[1]}:${match[2]}`;
}

function grokResolution(quality: string, size: string) {
    const value = `${quality} ${size}`.toLowerCase();
    return /4k|high|2880|3840/.test(value) ? "2k" : "1k";
}

function readError(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        const payload = error.response?.data as ImagePayload | undefined;
        return payload?.msg || payload?.message || payload?.error?.message || (error.response?.status ? `${fallback}?${error.response.status}?` : fallback);
    }
    return error instanceof Error ? error.message : fallback;
}
