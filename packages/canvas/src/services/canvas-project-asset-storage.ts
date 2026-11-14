import type { CanvasImportedAudio, CanvasImportedImage, CanvasImportedVideo } from "../features/canvas/contracts";

export type CanvasProjectAssetStorage = {
    uploadImage(file: File, signal?: AbortSignal): Promise<Pick<CanvasImportedImage, "url" | "storageKey" | "width" | "height" | "bytes" | "mimeType">>;
    uploadVideo(file: File, signal?: AbortSignal): Promise<Pick<CanvasImportedVideo, "url" | "storageKey" | "width" | "height" | "bytes" | "mimeType" | "durationMs">>;
    uploadAudio(file: File, signal?: AbortSignal): Promise<Pick<CanvasImportedAudio, "url" | "storageKey" | "bytes" | "mimeType" | "durationMs">>;
    readImage(image: { url?: string; dataUrl?: string; storageKey?: string }, signal?: AbortSignal): Promise<string>;
    readMedia(reference: { name: string; url?: string; storageKey?: string }, signal?: AbortSignal): Promise<Blob>;
    readStoredBlob(storageKey: string): Promise<Blob | null>;
    resolveImage(storageKey: string): Promise<string | null>;
    resolveMedia(storageKey: string): Promise<string | null>;
    deleteImages(keys: Iterable<string>): Promise<void>;
    deleteMedia(keys: Iterable<string>): Promise<void>;
    cleanupImages(usedData: unknown): Promise<void>;
    cleanupMedia(usedData: unknown): Promise<void>;
};

let storage: CanvasProjectAssetStorage | undefined;

export function configureCanvasProjectAssetStorage(adapter: CanvasProjectAssetStorage) {
    storage = adapter;
}

export function getCanvasProjectAssetStorage() {
    if (!storage) throw new Error("画布项目素材存储宿主尚未配置");
    return storage;
}
