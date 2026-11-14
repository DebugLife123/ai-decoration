import { readFileAsDataUrl } from "../../lib/image-utils";
import type { CanvasNodeMetadata } from "../../types/canvas";
import { canvasAssetMetadata } from "./asset-metadata";
import type { CanvasApi, CanvasAssetUploadAdapter, CanvasEditorAssetCommand, CanvasImportedAudio, CanvasImportedImage, CanvasImportedVideo, CanvasProjectAsset, CanvasUploadTicket } from "./contracts";

export type CanvasBinaryUploader = CanvasAssetUploadAdapter["uploadBinary"];
type CanvasImageUploadApi = Pick<CanvasApi, "uploadAsset"> | Pick<CanvasApi, "createUploadTicket" | "completeUpload" | "registerAsset"> | CanvasAssetUploadAdapter;
export type CanvasMediaUploadApi = Pick<CanvasAssetUploadAdapter, "createUploadTicket" | "uploadBinary" | "completeUpload" | "registerAsset" | "deleteAsset" | "cancelUpload">;
type CanvasMediaRegistration =
    | { kind: "VIDEO"; width: number; height: number; durationMs?: number }
    | { kind: "AUDIO"; durationMs?: number };

export function applyCanvasAssetCommandMetadata(metadata: CanvasNodeMetadata | undefined, command: Pick<CanvasEditorAssetCommand, "taskId" | "versionId">): CanvasNodeMetadata {
    return { ...metadata, ...(command.taskId ? { taskId: command.taskId, status: "success" as const } : {}), ...(command.versionId ? { versionId: command.versionId } : {}) };
}

async function uploadWithTicket(ticket: CanvasUploadTicket, file: File, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const response = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file, signal });
    if (!response.ok) throw new Error(`素材上传失败（HTTP ${response.status}）`);
}

export async function importCanvasImage(api: CanvasImageUploadApi, projectId: string, file: File, uploadBinary?: CanvasBinaryUploader, signal?: AbortSignal): Promise<CanvasImportedImage> {
    signal?.throwIfAborted();
    if (!file.type.startsWith("image/")) throw new Error("当前素材契约仅接收图片");
    const url = await readFileAsDataUrl(file);
    const image = new Image();
    image.src = url;
    try {
        await image.decode();
    } catch {
        throw new Error(`无法读取图片：${file.name}`);
    }
    signal?.throwIfAborted();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error(`图片尺寸无效：${file.name}`);
    const asset = "createUploadTicket" in api
        ? await (async () => {
            signal?.throwIfAborted();
            const ticket = await api.createUploadTicket({ projectId, name: file.name, mimeType: file.type, bytes: file.size });
            let registered: CanvasProjectAsset | null = null;
            try {
                signal?.throwIfAborted();
                if (ticket.projectId !== projectId) throw new Error("上传凭证不属于当前项目");
                const put = uploadBinary || ("uploadBinary" in api ? api.uploadBinary : uploadWithTicket);
                if (signal) await put(ticket, file, signal);
                else await put(ticket, file);
                signal?.throwIfAborted();
                const storageRef = await api.completeUpload({ projectId, uploadId: ticket.uploadId });
                signal?.throwIfAborted();
                registered = await api.registerAsset({ projectId, uploadId: ticket.uploadId, name: file.name, mimeType: file.type, kind: "IMAGE", width: image.naturalWidth, height: image.naturalHeight });
                signal?.throwIfAborted();
                if (registered.kind !== "IMAGE") throw new Error("图片上传返回了错误的素材类型");
                return { ...registered, storageRef };
            } catch (error) {
                if (registered && "deleteAsset" in api) await api.deleteAsset(projectId, registered.assetId).catch(() => undefined);
                if ("cancelUpload" in api) await api.cancelUpload({ projectId, uploadId: ticket.uploadId }).catch(() => undefined);
                throw error;
            }
        })()
        : await api.uploadAsset({ projectId, name: file.name, mimeType: file.type, url, width: image.naturalWidth, height: image.naturalHeight });
    if (asset.projectId !== projectId) throw new Error("上传结果不属于当前项目");
    return { ...asset, bytes: file.size };
}

async function readVideoMetadata(file: File, signal?: AbortSignal) {
    if (!file.type.startsWith("video/")) throw new Error("当前导入仅接收视频");
    const url = URL.createObjectURL(file);
    try {
        return await new Promise<{ width: number; height: number; durationMs?: number }>((resolve, reject) => {
            const video = document.createElement("video");
            const cleanup = () => {
                signal?.removeEventListener("abort", abort);
                video.onloadedmetadata = null;
                video.onerror = null;
                video.removeAttribute("src");
                video.load();
            };
            const abort = () => { cleanup(); reject(signal?.reason || new DOMException("Aborted", "AbortError")); };
            signal?.addEventListener("abort", abort, { once: true });
            video.onloadedmetadata = () => {
                const { videoWidth: width, videoHeight: height, duration } = video;
                cleanup();
                if (!width || !height) return reject(new Error(`视频尺寸无效：${file.name}`));
                resolve({ width, height, durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : undefined });
            };
            video.onerror = () => { cleanup(); reject(new Error(`无法读取视频：${file.name}`)); };
            video.preload = "metadata";
            video.src = url;
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function readAudioMetadata(file: File, signal?: AbortSignal) {
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav)$/i.test(file.name)) throw new Error("当前导入仅接收音频");
    const url = URL.createObjectURL(file);
    try {
        return await new Promise<{ durationMs?: number }>((resolve, reject) => {
            const audio = document.createElement("audio");
            const cleanup = () => {
                signal?.removeEventListener("abort", abort);
                audio.onloadedmetadata = null;
                audio.onerror = null;
                audio.removeAttribute("src");
                audio.load();
            };
            const abort = () => { cleanup(); reject(signal?.reason || new DOMException("Aborted", "AbortError")); };
            signal?.addEventListener("abort", abort, { once: true });
            audio.onloadedmetadata = () => {
                const duration = audio.duration;
                cleanup();
                resolve({ durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : undefined });
            };
            audio.onerror = () => { cleanup(); reject(new Error(`无法读取音频：${file.name}`)); };
            audio.preload = "metadata";
            audio.src = url;
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function importCanvasMedia(api: CanvasMediaUploadApi, projectId: string, file: File, registration: CanvasMediaRegistration, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const ticket = await api.createUploadTicket({ projectId, name: file.name, mimeType: file.type || "application/octet-stream", bytes: file.size });
    let registered: CanvasProjectAsset | null = null;
    try {
        if (ticket.projectId !== projectId) throw new Error("上传凭证不属于当前项目");
        await api.uploadBinary(ticket, file, signal);
        signal?.throwIfAborted();
        const storageRef = await api.completeUpload({ projectId, uploadId: ticket.uploadId });
        signal?.throwIfAborted();
        registered = await api.registerAsset({ projectId, uploadId: ticket.uploadId, name: file.name, mimeType: file.type || "application/octet-stream", ...registration });
        signal?.throwIfAborted();
        return { ...registered, storageRef, bytes: file.size };
    } catch (error) {
        if (registered) await api.deleteAsset(projectId, registered.assetId).catch(() => undefined);
        await api.cancelUpload({ projectId, uploadId: ticket.uploadId }).catch(() => undefined);
        throw error;
    }
}

export async function importCanvasVideo(api: CanvasMediaUploadApi, projectId: string, file: File, signal?: AbortSignal): Promise<CanvasImportedVideo> {
    const metadata = await readVideoMetadata(file, signal);
    const asset = await importCanvasMedia(api, projectId, file, { kind: "VIDEO", ...metadata }, signal);
    if (asset.projectId !== projectId || asset.kind !== "VIDEO") throw new Error("视频上传结果与当前项目或类型不符");
    return asset;
}

export async function importCanvasAudio(api: CanvasMediaUploadApi, projectId: string, file: File, signal?: AbortSignal): Promise<CanvasImportedAudio> {
    const metadata = await readAudioMetadata(file, signal);
    const asset = await importCanvasMedia(api, projectId, file, { kind: "AUDIO", ...metadata }, signal);
    if (asset.projectId !== projectId || asset.kind !== "AUDIO") throw new Error("音频上传结果与当前项目或类型不符");
    return asset;
}

export { canvasAssetMetadata } from "./asset-metadata";
