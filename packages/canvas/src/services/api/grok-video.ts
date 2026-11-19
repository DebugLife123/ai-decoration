import axios from "axios";
import { isCodex2apiBaseUrl, isOpenAI2ApiBaseUrl, isXaiBaseUrl, normalizeGrokAspectRatio, normalizeGrokDuration, normalizeGrokResolution } from "../../lib/grok-video";
import { readFileAsDataUrl } from "../../lib/image-utils";
import { readHostImage } from "./image-read";
import { buildProviderApiUrl, modelOptionName } from "../../lib/provider-runtime";
import type { ProviderRequestConfig } from "../../types/provider-request";
import type { ReferenceImage } from "../../types/image";
import type { RequestOptions, VideoGenerationResult, VideoGenerationTask, VideoGenerationTaskState, VideoMediaOptions } from "./video/types";

type VideoReference = NonNullable<VideoMediaOptions["videos"]>[number];

type GrokResponse = Record<string, unknown>;
export async function createGrokVideoTask(config: ProviderRequestConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    if (options?.audios?.length) throw new Error("Grok 视频当前不支持参考音频");
    if ((options?.videos?.length || 0) > 1) throw new Error("Grok 视频编辑只支持一条参考视频");
    const payloads = options?.videos?.length ? await buildEditPayloads(config, model, prompt, options.videos[0], options) : await buildPayloads(config, model, prompt, references, options);
    const paths = options?.videos?.length ? ["/videos/edits", "/video/edits"] : createPaths(config.baseUrl);
    let lastError: unknown;
    for (const path of paths) {
        for (const payload of payloads) {
            try {
                const response = await axios.post<GrokResponse>(apiUrl(config, path), payload, { headers: headers(config), timeout: 180000, signal: options?.signal });
                const data = unwrap(response.data);
                const id = readTaskId(data);
                const readyUrl = readVideoUrl(data);
                if (readyUrl) return { id: id || "grok-inline", provider: "grok", model, requestModel: String(payload.model), requestedResolution: normalizeGrokResolution(config.vquality), acceptedResolution: String(payload.resolution || ""), readyResult: await videoResultFromUrl(readyUrl, options) };
                if (!id) throw new Error("Grok 视频接口没有返回 request_id 或 id");
                return { id, provider: "grok", model, requestModel: String(payload.model), requestedResolution: normalizeGrokResolution(config.vquality), acceptedResolution: String(payload.resolution || "") };
            } catch (error) {
                lastError = error;
                if (isPermanentGrokError(error)) throw new Error(formatGrokError(error, config.baseUrl));
            }
        }
    }
    throw new Error(formatGrokError(lastError, config.baseUrl));
}

export async function pollGrokVideoTask(config: ProviderRequestConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.readyResult) return { status: "completed", result: task.readyResult };
    let lastError: unknown;
    for (const template of pollPaths(config.baseUrl)) {
        try {
            const response = await axios.get<GrokResponse>(apiUrl(config, template.replace("{id}", encodeURIComponent(task.id))), { headers: headers(config), timeout: 60000, signal: options?.signal });
            const data = unwrap(response.data);
            const status = String(data.status || "").toLowerCase();
            const url = readVideoUrl(data);
            if (url) return { status: "completed", result: await videoResultFromUrl(url, options) };
            if (["failed", "error", "cancelled", "canceled"].includes(status)) return { status: "failed", error: readError(data) || "Grok 视频生成失败" };
            if (["completed", "complete", "done", "success"].includes(status)) {
                const content = await downloadContent(config, task.id, options);
                if (content) return { status: "completed", result: { blob: content } };
            }
            return { status: "pending" };
        } catch (error) {
            lastError = error;
            if (isPermanentGrokError(error)) continue;
        }
    }
    if (lastError && isNetworkError(lastError)) return { status: "pending" };
    throw new Error(formatGrokError(lastError, config.baseUrl, "查询"));
}

async function buildPayloads(config: ProviderRequestConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions) {
    const images = await Promise.all(references.map(async (image) => ({ url: await readVideoImage(image, options) })));
    const common = { model: modelOptionName(model), prompt, duration: normalizeGrokDuration(config.videoSeconds), aspect_ratio: normalizeGrokAspectRatio(config.size), resolution: normalizeGrokResolution(config.vquality) };
    if (!images.length) return [common, { ...common, seconds: String(common.duration) }];
    if (images.length === 1) return [{ ...common, image: images[0] }, { ...common, image: images[0].url }];
    return [{ ...common, reference_images: images }, { ...common, images: images.map((image) => image.url) }];
}

async function buildEditPayloads(config: ProviderRequestConfig, model: string, prompt: string, reference: VideoReference, options?: VideoMediaOptions) {
    const video = await mediaToDataUrl(reference, options);
    const common = { model: modelOptionName(model), prompt, duration: normalizeGrokDuration(config.videoSeconds), aspect_ratio: normalizeGrokAspectRatio(config.size), resolution: normalizeGrokResolution(config.vquality) };
    return [{ ...common, video: { url: video } }, { ...common, video_url: video }, { ...common, input_video: video }];
}

function createPaths(baseUrl: string) {
    if (isOpenAI2ApiBaseUrl(baseUrl) || isPrivateNewApi(baseUrl)) return ["/video/generations"];
    if (isCodex2apiBaseUrl(baseUrl) || isXaiBaseUrl(baseUrl)) return ["/videos/generations"];
    if (baseUrl.toLowerCase().includes("/lan-ai")) return ["/videos/generations", "/video/generations"];
    return ["/videos/generations", "/video/generations", "/videos"];
}

function pollPaths(baseUrl: string) {
    if (isOpenAI2ApiBaseUrl(baseUrl) || isPrivateNewApi(baseUrl)) return ["/video/generations/{id}", "/video/generations?task_id={id}", "/video/generations?request_id={id}", "/video/generations?id={id}"];
    if (isCodex2apiBaseUrl(baseUrl) || isXaiBaseUrl(baseUrl)) return ["/videos/{id}", "/videos/generations?request_id={id}", "/videos/generations?id={id}"];
    return ["/videos/{id}", "/videos/generations/{id}", "/video/generations/{id}", "/videos/generations?request_id={id}", "/videos?request_id={id}"];
}

async function downloadContent(config: ProviderRequestConfig, id: string, options?: RequestOptions) {
    for (const template of ["/videos/{id}/content", "/videos/{id}/download", "/videos/{id}/file", "/video/generations/{id}/content"]) {
        try {
            const response = await axios.get<Blob>(apiUrl(config, template.replace("{id}", encodeURIComponent(id))), { headers: headers(config), responseType: "blob", signal: options?.signal });
            if (response.data.size) return response.data;
        } catch {
            continue;
        }
    }
    return null;
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        return { blob: response.data };
    } catch {
        return { url, mimeType: "video/mp4" };
    }
}

function apiUrl(config: ProviderRequestConfig, path: string) {
    return buildProviderApiUrl(config.baseUrl, path, config);
}

function headers(config: ProviderRequestConfig) {
    return { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
}

function unwrap(payload: GrokResponse): GrokResponse {
    if (payload.code !== undefined && ![0, "0", 200, "200", "ok", "success"].includes(payload.code as never)) throw new Error(readError(payload) || `Grok 接口返回错误（code ${String(payload.code)}）`);
    for (const key of ["data", "result", "response"]) {
        if (payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key])) return payload[key] as GrokResponse;
    }
    return payload;
}

function readTaskId(payload: GrokResponse) {
    for (const key of ["request_id", "requestId", "id", "task_id", "taskId", "job_id", "video_id"]) {
        const value = payload[key];
        if (typeof value === "string" || typeof value === "number") return String(value);
    }
    return "";
}

function readVideoUrl(payload: GrokResponse): string {
    const direct = ["video_url", "output_url", "download_url", "result_url", "url"];
    for (const key of direct) if (typeof payload[key] === "string" && /^https?:\/\//i.test(payload[key] as string)) return payload[key] as string;
    for (const key of ["video", "content", "output", "data", "result", "response"]) {
        const value = payload[key];
        if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            const url = readVideoUrl(value as GrokResponse);
            if (url) return url;
        }
    }
    return "";
}

function readError(payload: GrokResponse) {
    const error = payload.error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && typeof (error as GrokResponse).message === "string") return (error as GrokResponse).message as string;
    return [payload.msg, payload.message, payload.detail].find((value): value is string => typeof value === "string") || "";
}

function isPermanentGrokError(error: unknown) {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status || 0;
    const detail = readError((error.response?.data || {}) as GrokResponse);
    return [400, 401, 403, 415, 422].includes(status) || /invalid api platform|model.?not.?found|unsupported|permission|quota/i.test(detail);
}

function isNetworkError(error: unknown) {
    return axios.isAxiosError(error) && (!error.response || [408, 409, 429, 500, 502, 503, 504].includes(error.response.status || 0));
}

function formatGrokError(error: unknown, baseUrl: string, action = "创建") {
    const detail = axios.isAxiosError(error) ? readError((error.response?.data || {}) as GrokResponse) : error instanceof Error ? error.message : "未知错误";
    if (/invalid api platform\s*:\s*48/i.test(detail)) return `Grok 视频${action}失败：${detail}。前端已选择 ${isOpenAI2ApiBaseUrl(baseUrl) ? "/v1/video/generations" : "Grok 视频"} 路径，但后台模型所属渠道未绑定 xAI/Grok 视频平台，请检查 Key 分组和渠道配置。`;
    return `Grok 视频${action}失败：${detail}`;
}

async function mediaToDataUrl(item: VideoReference, options?: VideoMediaOptions) {
    if (!options?.readMedia) throw new Error("视频 Provider 执行需要宿主媒体读取器");
    const blob = await options.readMedia(item);
    return readFileAsDataUrl(new File([blob], item.name || "reference.mp4", { type: item.type || blob.type || "video/mp4" }));
}

async function readVideoImage(image: ReferenceImage, options?: VideoMediaOptions) {
    if (!options?.readImage) throw new Error("视频 Provider 执行需要宿主图片读取器");
    return readHostImage(image, { signal: options.signal, readImage: options.readImage });
}

function isPrivateNewApi(baseUrl: string) {
    try {
        const url = new URL(/^https?:\/\//i.test(baseUrl) ? baseUrl : `http://${baseUrl}`);
        return ["localhost", "127.0.0.1"].includes(url.hostname);
    } catch {
        return false;
    }
}
