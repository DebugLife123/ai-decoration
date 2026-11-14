import { audioMimeType } from "../../../lib/audio-generation";
import type { CanvasAudioImporter, CanvasVideoImporter } from "../../../features/canvas/contracts";
import { readCanvasReferenceMedia, type CanvasMediaAdapter } from "../../../features/canvas/media";
import type { VideoGenerationResult } from "../video/types";

function mediaFile(blob: Blob, kind: "video" | "audio", fallback: string, name: string) {
    const mimeType = !blob.type || blob.type === "application/octet-stream" ? fallback : blob.type;
    if (!mimeType.startsWith(`${kind}/`)) throw new Error(kind === "video" ? "结果不是可导入的视频" : "结果不是可导入的音频");
    return new File([blob], name, { type: mimeType });
}

export async function importCanvasResultVideo(media: CanvasMediaAdapter, importVideo: CanvasVideoImporter | undefined, projectId: string, result: VideoGenerationResult, name: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!importVideo) throw new Error("当前宿主不支持视频导入");
    let blob = result.blob;
    if (!blob && result.url) {
        blob = await readCanvasReferenceMedia(media, projectId, { name, url: result.url }, signal || new AbortController().signal);
    }
    signal?.throwIfAborted();
    if (!blob) throw new Error("没有可导入的视频结果");
    const asset = await importVideo(projectId, mediaFile(blob, "video", result.mimeType || "video/mp4", name));
    // Persistence may have completed; cancellation only prevents stale canvas publication.
    signal?.throwIfAborted();
    if (asset.projectId !== projectId || asset.kind !== "VIDEO") throw new Error("视频导入结果与当前项目或类型不符");
    return asset;
}

export async function importCanvasResultAudio(importAudio: CanvasAudioImporter | undefined, projectId: string, blob: Blob, name: string, format: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!importAudio) throw new Error("当前宿主不支持音频导入");
    const asset = await importAudio(projectId, mediaFile(blob, "audio", audioMimeType(format), name));
    signal?.throwIfAborted();
    if (asset.projectId !== projectId || asset.kind !== "AUDIO") throw new Error("音频导入结果与当前项目或类型不符");
    return asset;
}
