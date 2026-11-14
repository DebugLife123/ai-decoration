import type { CanvasImageImporter } from "./contracts";

export type CanvasResultImageReader = (source: string, name: string, signal?: AbortSignal) => Promise<Blob>;

export async function importCanvasResultImage(importImage: CanvasImageImporter, projectId: string, source: string | Blob, name: string, signal?: AbortSignal, readSource?: CanvasResultImageReader) {
    signal?.throwIfAborted();
    const reader = readSource;
    if (typeof source === "string" && !reader) throw new Error("结果图片读取器尚未配置");
    const blob = typeof source === "string" ? await reader!(source, name, signal) : source;
    signal?.throwIfAborted();
    if (!blob.type.startsWith("image/")) throw new Error("结果不是可导入的图片");
    const asset = await importImage(projectId, new File([blob], name, { type: blob.type }));
    // Importers may already have saved the asset; cancellation only prevents stale canvas publication.
    signal?.throwIfAborted();
    if (asset.projectId !== projectId) throw new Error("图片结果不属于当前项目");
    return asset;
}
