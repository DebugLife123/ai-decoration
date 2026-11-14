import axios from "axios";

import { agnesFrameCount, AGNES_VIDEO_HEIGHT, AGNES_VIDEO_WIDTH, isAgnesBaseUrl, isAgnesVideoModel, normalizeAgnesDuration } from "../../lib/agnes-video";
import { isKlingVideoModel, klingAspectRatioFromSize, klingModeFromQuality, normalizeKlingDuration, normalizeKlingSize } from "../../lib/kling-video";
import { isArkPlanBaseUrl, isSeedanceVideoModel, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution } from "../../lib/seedance-video";
import { readFileAsDataUrl } from "../../lib/image-utils";
import { buildProviderApiUrl, modelOptionName } from "../../lib/provider-runtime";
import type { ProviderRequestConfig } from "../../types/provider-request";
import { readHostImage } from "./image-read";
import type { ReferenceImage } from "../../types/image";
import type { RequestOptions, VideoGenerationResult, VideoGenerationTask, VideoGenerationTaskState, VideoMediaOptions } from "./video/types";

type ApiRecord = Record<string, unknown>;

export function isSpecializedVideoModel(model: string, baseUrl: string) {
    return isSeedanceVideoModel(model) || isKlingVideoModel(model) || isAgnesVideoModel(model) || isAgnesBaseUrl(baseUrl);
}

export async function createSpecializedVideoTask(config: ProviderRequestConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    if (isAgnesVideoModel(model) || isAgnesBaseUrl(config.baseUrl)) return createAgnes(config, model, prompt, references, options);
    if (isKlingVideoModel(model)) return createKling(config, model, prompt, references, options);
    return createSeedance(config, model, prompt, references, options);
}

export async function pollSpecializedVideoTask(config: ProviderRequestConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.provider === "agnes") return pollAgnes(config, task, options);
    if (task.provider === "kling") return pollTask(config, task, ["/video/generations/{id}", "/kling/v1/videos/{id}"], options);
    return pollTask(config, task, ["/contents/generations/tasks/{id}", "/video/generations/{id}", "/video/generations?task_id={id}"], options);
}

async function createSeedance(config: ProviderRequestConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const images = await Promise.all(references.map((image) => readVideoImage(image, options)));
    const videos = await Promise.all((options?.videos || []).map((item) => mediaToDataUrl(item, options)));
    const audios = await Promise.all((options?.audios || []).map((item) => mediaToDataUrl(item, options)));
    if (audios.length && !images.length && !videos.length) throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    const content = [{ type: "text", text: prompt }, ...images.map((url) => ({ type: "image_url", image_url: { url }, role: "reference_image" })), ...videos.map((url) => ({ type: "video_url", video_url: { url }, role: "reference_video" })), ...audios.map((url) => ({ type: "audio_url", audio_url: { url }, role: "reference_audio" }))];
    const body = { model: modelOptionName(model), prompt, content, duration: normalizeSeedanceDuration(config.videoSeconds), ratio: normalizeSeedanceRatio(config.size), resolution: normalizeSeedanceResolution(config.vquality), generate_audio: config.videoGenerateAudio !== "false", watermark: config.videoWatermark === "true", ...(images.length ? { image_urls: images, reference_images: images } : {}), ...(videos.length ? { video_urls: videos, reference_videos: videos } : {}), ...(audios.length ? { audio_urls: audios, reference_audios: audios } : {}) };
    const path = isArkPlanBaseUrl(config.baseUrl) ? "/contents/generations/tasks" : "/video/generations";
    const data = await post(config, path, body, options);
    const id = readId(data);
    if (!id) throw new Error("Seedance 接口没有返回任务 ID");
    return { id, provider: "seedance", model };
}

async function createKling(config: ProviderRequestConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    if (references.length > 2) throw new Error("Kling 最多支持两张参考图（首帧和尾帧）");
    if (options?.videos?.length || options?.audios?.length) throw new Error("Kling 当前不支持参考视频或参考音频，请改用参考图");
    const images = await Promise.all(references.map((image) => readVideoImage(image, options)));
    const body = { model: modelOptionName(model), prompt, duration: normalizeKlingDuration(config.videoSeconds), mode: klingModeFromQuality(config.vquality), size: normalizeKlingSize(config.size), aspect_ratio: klingAspectRatioFromSize(config.size), ...(images[0] ? { image: images[0] } : {}), ...(images[1] ? { image_tail: images[1] } : {}) };
    const path = images.length ? "/kling/v1/videos/image2video" : "/kling/v1/videos/text2video";
    let data: ApiRecord;
    try {
        data = await post(config, path, body, options);
    } catch {
        data = await post(config, "/video/generations", body, options);
    }
    const id = readId(data);
    if (!id) throw new Error("Kling 接口没有返回任务 ID");
    return { id, provider: "kling", model };
}

async function createAgnes(config: ProviderRequestConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    if (references.length || options?.videos?.length || options?.audios?.length) throw new Error("Agnes 当前只支持文生视频，请移除所有参考素材");
    const duration = normalizeAgnesDuration(config.videoSeconds);
    const data = await post(config, "/v1/videos", { model: modelOptionName(model), prompt, width: AGNES_VIDEO_WIDTH, height: AGNES_VIDEO_HEIGHT, num_frames: agnesFrameCount(duration), frame_rate: 24 }, options);
    const id = readId(data);
    if (!id) throw new Error("Agnes 接口没有返回任务 ID");
    return { id, provider: "agnes", model };
}

async function pollAgnes(config: ProviderRequestConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    return pollTask(config, task, [`/agnesapi?video_id={id}`], options);
}

async function pollTask(config: ProviderRequestConfig, task: VideoGenerationTask, paths: string[], options?: RequestOptions): Promise<VideoGenerationTaskState> {
    let lastError: unknown;
    for (const template of paths) {
        try {
            const data = await get(config, template.replace("{id}", encodeURIComponent(task.id)), options);
            const url = readUrl(data);
            const status = String(data.status || "").toLowerCase();
            if (url) return { status: "completed", result: await resultFromUrl(url, options) };
            if (["failed", "error", "cancelled", "canceled"].includes(status)) return { status: "failed", error: readError(data) || "视频生成失败" };
            return { status: "pending" };
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(lastError instanceof Error ? lastError.message : "视频任务查询失败");
}

async function post(config: ProviderRequestConfig, path: string, body: ApiRecord, options?: RequestOptions) {
    try {
        return unwrap((await axios.post<ApiRecord>(buildProviderApiUrl(config.baseUrl, path, config), body, { headers: headers(config), timeout: 180000, signal: options?.signal })).data);
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function get(config: ProviderRequestConfig, path: string, options?: RequestOptions) {
    return unwrap((await axios.get<ApiRecord>(buildProviderApiUrl(config.baseUrl, path, config), { headers: headers(config), timeout: 60000, signal: options?.signal })).data);
}

function headers(config: ProviderRequestConfig) {
    return { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
}

function unwrap(payload: ApiRecord) {
    if (payload.code !== undefined && ![0, "0", 200, "200"].includes(payload.code as never)) throw new Error(readError(payload) || "视频接口返回错误");
    for (const key of ["data", "result", "response"]) if (payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key])) return payload[key] as ApiRecord;
    return payload;
}

function readId(payload: ApiRecord) {
    for (const key of ["id", "task_id", "taskId", "video_id", "videoId", "request_id"]) if (typeof payload[key] === "string" || typeof payload[key] === "number") return String(payload[key]);
    return "";
}

function readUrl(payload: ApiRecord): string {
    for (const key of ["video_url", "url", "result_url", "output_url", "download_url"]) if (typeof payload[key] === "string" && /^https?:\/\//i.test(payload[key] as string)) return payload[key] as string;
    for (const key of ["video", "content", "result", "data"]) if (payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key])) { const url = readUrl(payload[key] as ApiRecord); if (url) return url; }
    return "";
}

async function resultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try { return { blob: (await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal })).data }; } catch { return { url, mimeType: "video/mp4" }; }
}

function readError(payload: ApiRecord) {
    const error = payload.error;
    return typeof error === "string" ? error : error && typeof error === "object" && typeof (error as ApiRecord).message === "string" ? String((error as ApiRecord).message) : String(payload.msg || payload.message || payload.detail || "");
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) return readError((error.response?.data || {}) as ApiRecord) || (error.response?.status ? `${fallback}（HTTP ${error.response.status}）` : fallback);
    return error instanceof Error ? error.message : fallback;
}

async function mediaToDataUrl(item: { name: string; type?: string; url?: string; storageKey?: string }, options?: VideoMediaOptions) {
    if (!options?.readMedia) throw new Error("视频 Provider 执行需要宿主媒体读取器");
    const blob = await options.readMedia(item);
    return readFileAsDataUrl(new File([blob], item.name, { type: item.type || blob.type }));
}

async function readVideoImage(image: ReferenceImage, options?: VideoMediaOptions) {
    if (!options?.readImage) throw new Error("视频 Provider 执行需要宿主图片读取器");
    return readHostImage(image, { signal: options.signal, readImage: options.readImage });
}
