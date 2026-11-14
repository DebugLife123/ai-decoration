import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    stores: new Map<string, Map<string, unknown>>(), upload: vi.fn(), failWrite: false, failWriteOnce: false, failMediaWrite: false,
    videoError: false, audioError: false, videoWidth: 1920, videoHeight: 1080, onMetadata: vi.fn(),
}));
vi.mock("../../../web/src/services/localforage", () => ({
    createLocalForageStore: (storeName: string) => {
        const data = () => {
            if (!mocks.stores.has(storeName)) mocks.stores.set(storeName, new Map());
            return mocks.stores.get(storeName)!;
        };
        return {
            getItem: async (key: string) => data().get(key) ?? null,
            setItem: async (key: string, value: unknown) => {
                data().set(key, value);
                if (storeName === "canvas_project_assets" && mocks.failWriteOnce) {
                    mocks.failWriteOnce = false;
                    throw new Error("catalog write failed");
                }
                if (storeName === "canvas_project_assets" && mocks.failWrite) throw new Error("catalog write failed");
                if (storeName === "media_files" && mocks.failMediaWrite) throw new Error("media write failed");
                return value;
            },
            removeItem: async (key: string) => { data().delete(key); },
            iterate: async (callback: (value: unknown, key: string) => void) => { data().forEach(callback); },
        };
    },
}));
vi.mock("localforage", () => ({
    default: {
        createInstance: ({ storeName }: { storeName: string }) => {
            const data = () => {
                if (!mocks.stores.has(storeName)) mocks.stores.set(storeName, new Map());
                return mocks.stores.get(storeName)!;
            };
            return {
                getItem: async (key: string) => data().get(key) ?? null,
                setItem: async (key: string, value: unknown) => {
                    data().set(key, value);
                    if (storeName === "canvas_project_assets" && mocks.failWriteOnce) {
                        mocks.failWriteOnce = false;
                        throw new Error("catalog write failed");
                    }
                    if (storeName === "canvas_project_assets" && mocks.failWrite) throw new Error("catalog write failed");
                    return value;
                },
                removeItem: async (key: string) => { data().delete(key); },
                iterate: async (callback: (value: unknown, key: string) => void) => { data().forEach(callback); },
            };
        },
    },
}));
vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../src/stores/use-config-store", () => ({ withLocalProxy: (url: string) => url }));
vi.mock("../src/lib/canvas/canvas-image-data", () => ({
    cropDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,Y3JvcA=="),
    upscaleDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,dG9vbA=="),
    splitDataUrl: vi.fn().mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({ row: Math.floor(index / 2), column: index % 2, x: index % 2 * 480, y: Math.floor(index / 2) * 320, width: 480, height: 320, dataUrl: "data:image/png;base64,dG9vbA==" }))),
}));
vi.mock("../../../web/src/services/image-storage", async (importOriginal) => ({
    ...await importOriginal<typeof import("../../../web/src/services/image-storage")>(), uploadImage: mocks.upload,
}));

import { cleanupProjectAssets, deleteProjectAsset, importProjectAudio, importProjectImage, importProjectVideo, listProjectAssets, subscribeProjectAssets } from "../src/services/canvas-project-assets";
import { configureCanvasProjectAssetCatalog } from "../src/services/canvas-project-asset-catalog";
import { configureCanvasProjectAssetStorage } from "../src/services/canvas-project-asset-storage";
import { localCanvasProjectAssetCatalog } from "../../../web/src/services/api/canvas/local-catalog";
import { cleanupUnusedImages, deleteStoredImages, resolveImageUrl } from "../../../web/src/services/image-storage";
import { cleanupUnusedMedia, deleteStoredMedia, resolveMediaUrl, uploadAudioFile, uploadVideoFile } from "../../../web/src/services/file-storage";
import { createCroppedImageNode } from "../src/features/canvas/crop-image";
import { createMaskImageNode } from "../src/features/canvas/mask-image";
import { createUpscaledImageNode } from "../src/features/canvas/upscale-image";
import { prepareImageSplit, saveImageSplit } from "../src/features/canvas/split-image";
import { importCanvasResultImage } from "../src/features/canvas/result-image";
import { importCanvasResultAudio, importCanvasResultVideo } from "../src/services/api/canvas/result-media";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const file = new File(["fixture"], "room.png", { type: "image/png" });
const catalog = () => mocks.stores.get("canvas_project_assets")!;
const files = () => mocks.stores.get("image_files")!;
const mediaFiles = () => mocks.stores.get("media_files")!;
const videoFile = new File(["fixture"], "room.mp4", { type: "video/mp4" });
const audioFile = new File(["fixture"], "narration.mp3", { type: "audio/mpeg" });
const resultMediaAdapter = { readMedia: vi.fn(async () => videoFile) } as unknown as CanvasMediaAdapter;
const localCleanupSteps = { cleanupImages: cleanupUnusedImages, cleanupMedia: cleanupUnusedMedia };
const testAssetStorage = () => ({ uploadImage: mocks.upload, uploadVideo: uploadVideoFile, uploadAudio: uploadAudioFile, readImage: vi.fn(), readMedia: vi.fn(), readStoredBlob: vi.fn(), resolveImage: (key: string) => resolveImageUrl(key), resolveMedia: (key: string) => resolveMediaUrl(key), deleteImages: deleteStoredImages, deleteMedia: deleteStoredMedia, cleanupImages: cleanupUnusedImages, cleanupMedia: cleanupUnusedMedia });
async function configureReloadedAssetStorage() {
    const [storagePort, catalogPort, imageStorage, fileStorage] = await Promise.all([
        import("../src/services/canvas-project-asset-storage"),
        import("../src/services/canvas-project-asset-catalog"),
        import("../../../web/src/services/image-storage"),
        import("../../../web/src/services/file-storage"),
    ]);
    storagePort.configureCanvasProjectAssetStorage({ uploadImage: mocks.upload, uploadVideo: fileStorage.uploadVideoFile, uploadAudio: fileStorage.uploadAudioFile, readImage: vi.fn(), readMedia: vi.fn(), readStoredBlob: vi.fn(), resolveImage: (key) => imageStorage.resolveImageUrl(key), resolveMedia: (key) => fileStorage.resolveMediaUrl(key), deleteImages: imageStorage.deleteStoredImages, deleteMedia: fileStorage.deleteStoredMedia, cleanupImages: imageStorage.cleanupUnusedImages, cleanupMedia: fileStorage.cleanupUnusedMedia });
    catalogPort.configureCanvasProjectAssetCatalog(localCanvasProjectAssetCatalog);
}

beforeEach(() => {
    configureCanvasProjectAssetCatalog(localCanvasProjectAssetCatalog);
    configureCanvasProjectAssetStorage(testAssetStorage());
    mocks.stores.clear();
    mocks.failWrite = false;
    mocks.failWriteOnce = false;
    mocks.failMediaWrite = false;
    mocks.videoError = false;
    mocks.audioError = false;
    mocks.videoWidth = 1920;
    mocks.videoHeight = 1080;
    mocks.onMetadata.mockReset();
    vi.stubGlobal("document", { createElement: (kind: string) => ({
        videoWidth: mocks.videoWidth, videoHeight: mocks.videoHeight, duration: 1.5,
        onloadedmetadata: null as null | (() => void), onerror: null as null | (() => void),
        removeAttribute: vi.fn(), load: vi.fn(),
        set src(_value: string) {
            queueMicrotask(() => { mocks.onMetadata(); if (kind === "audio" ? mocks.audioError : mocks.videoError) this.onerror?.(); else this.onloadedmetadata?.(); });
        },
    }) });
    vi.clearAllMocks();
    mocks.upload.mockImplementation(async () => {
        const storageKey = `image:${crypto.randomUUID()}`;
        if (!mocks.stores.has("image_files")) mocks.stores.set("image_files", new Map());
        files().set(storageKey, new Blob(["fixture"], { type: "image/png" }));
        return { storageKey, url: "blob:upload", width: 960, height: 640, bytes: 7, mimeType: "image/png" };
    });
});

afterEach(() => vi.unstubAllGlobals());

const saveMediaResult = (kind: "video" | "audio", signal?: AbortSignal) => kind === "video"
    ? importCanvasResultVideo(resultMediaAdapter, (id, file) => importProjectVideo(id, file, () => true), "a", { blob: videoFile }, "generated.mp4", signal)
    : importCanvasResultAudio((id, file) => importProjectAudio(id, file, () => true), "a", audioFile, "generated.mp3", "mp3", signal);

test.each(["video", "audio"] as const)("generated %s results get independent project assets and retain source references", async (kind) => {
    const original = await saveMediaResult(kind);
    const sourceVersion = { assetId: original.assetId, storageKey: original.storageKey, versionId: "source-version" };
    const before = { ...sourceVersion };
    const result = await saveMediaResult(kind);
    expect(result.assetId).not.toBe(original.assetId);
    expect(result.storageKey).not.toBe(original.storageKey);
    expect(result).toMatchObject({ projectId: "a", durationMs: 1500 });
    expect((await listProjectAssets("a")).map((asset) => asset.assetId)).toEqual([original.assetId, result.assetId]);
    expect(await listProjectAssets("b")).toEqual([]);
    expect(sourceVersion).toEqual(before);
    expect(mediaFiles().has(original.storageKey!)).toBe(true);
});

test("deletes an unreferenced project asset and its stored image", async () => {
    const asset = await importProjectImage("a", file, () => true);
    await deleteProjectAsset("a", asset.assetId, () => false);
    expect(await listProjectAssets("a")).toEqual([]);
    expect(files().has(asset.storageKey!)).toBe(false);
});

test("rejects deleting a referenced project asset without removing catalog or media", async () => {
    const asset = await importProjectImage("a", file, () => true);
    await expect(deleteProjectAsset("a", asset.assetId, (assetId) => assetId === asset.assetId)).rejects.toMatchObject({ code: "ASSET_IN_USE" });
    expect((await listProjectAssets("a")).map((item) => item.assetId)).toEqual([asset.assetId]);
    expect(files().has(asset.storageKey!)).toBe(true);
});

test("restores the catalog entry when stored media cleanup fails", async () => {
    const asset = await importProjectImage("a", file, () => true);
    const storage = testAssetStorage();
    storage.deleteImages = vi.fn().mockRejectedValue(new Error("media cleanup failed"));
    await expect(deleteProjectAsset("a", asset.assetId, () => false, localCanvasProjectAssetCatalog, storage)).rejects.toThrow("media cleanup failed");
    expect((await listProjectAssets("a")).map((item) => item.assetId)).toEqual([asset.assetId]);
});

test.each(["video", "audio"] as const)("generated %s metadata and catalog errors do not damage existing media and allow retry", async (kind) => {
    const original = await saveMediaResult(kind);
    if (kind === "video") mocks.videoError = true;
    else mocks.audioError = true;
    await expect(saveMediaResult(kind)).rejects.toThrow(kind === "video" ? "无法读取视频" : "无法读取音频");
    mocks.videoError = mocks.audioError = false;
    mocks.failWriteOnce = true;
    await expect(saveMediaResult(kind)).rejects.toThrow("catalog write failed");
    expect([...catalog().keys()]).toEqual([original.assetId]);
    expect([...mediaFiles().keys()]).toEqual([original.storageKey]);
    await saveMediaResult(kind);
    expect(mediaFiles().size).toBe(2);
});

test.each(["video", "audio"] as const)("canceling %s persistence prevents canvas publication but retains the saved project asset", async (kind) => {
    const controller = new AbortController();
    mocks.onMetadata.mockImplementationOnce(() => controller.abort());
    await expect(saveMediaResult(kind, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(await listProjectAssets("a")).toHaveLength(1);
    expect(mediaFiles().size).toBe(1);
});

test("generated results and captured frames get independent project assets without changing the source version", async () => {
    const original = await importProjectImage("a", file, () => true);
    const source = { assetId: original.assetId, storageKey: original.storageKey, versionId: "version" };
    const snapshot = { ...source };
    const importer = (id: string, file: File) => importProjectImage(id, file, () => true);
    const results = await Promise.all(["generated.png", "frame.png"].map((name) => importCanvasResultImage(importer, "a", file, name)));
    expect(new Set([original.assetId, ...results.map((asset) => asset.assetId)]).size).toBe(3);
    expect(new Set([original.storageKey, ...results.map((asset) => asset.storageKey)]).size).toBe(3);
    expect((await listProjectAssets("a")).map((asset) => asset.assetId)).toEqual([original.assetId, ...results.map((asset) => asset.assetId)]);
    expect(await listProjectAssets("b")).toEqual([]);
    expect(source).toEqual(snapshot);
    expect(files().has(original.storageKey!)).toBe(true);
});

test("result catalog failure rolls back only the new file and allows manual retry", async () => {
    const original = await importProjectImage("a", file, () => true);
    const importer = (id: string, file: File) => importProjectImage(id, file, () => true);
    mocks.failWrite = true;
    await expect(importCanvasResultImage(importer, "a", file, "generated.png")).rejects.toThrow("catalog write failed");
    expect([...catalog().keys()]).toEqual([original.assetId]);
    expect([...files().keys()]).toEqual([original.storageKey]);
    mocks.failWrite = false;
    const result = await importCanvasResultImage(importer, "a", file, "generated.png");
    expect((await listProjectAssets("a")).map((asset) => asset.assetId)).toEqual([original.assetId, result.assetId]);
    expect(files().size).toBe(2);
});

test("upscale saves an independent project asset, rolling back a failed write before manual retry", async () => {
    const original = await importProjectImage("a", file, () => true);
    const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "room", position: { x: 0, y: 0 }, width: 400, height: 300,
        metadata: { content: original.url, assetId: original.assetId, storageKey: original.storageKey, versionId: "version" } };
    const save = () => createUpscaledImageNode((id, file) => importProjectImage(id, file, () => true), "a", source, { targetLongEdge: 2048, algorithm: "high" });
    mocks.failWrite = true;
    await expect(save()).rejects.toThrow("catalog write failed");
    expect([...catalog().keys()]).toEqual([original.assetId]);
    expect([...files().keys()]).toEqual([original.storageKey]);
    mocks.failWrite = false;
    const result = await save();
    expect((await listProjectAssets("a")).map((asset) => asset.assetId)).toEqual([original.assetId, result.metadata!.assetId]);
    expect(await listProjectAssets("b")).toEqual([]);
    expect(source.metadata!.versionId).toBe("version");
    expect(result.metadata!.versionId).toBeUndefined();
});

test("split catalog failure rolls back only the failed piece; retry preserves the other three files", async () => {
    const original = await importProjectImage("a", file, () => true);
    const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "room", position: { x: 0, y: 0 }, width: 400, height: 300, metadata: { content: original.url } };
    const batch = await prepareImageSplit("a", source, { rows: 2, columns: 2 });
    mocks.failWriteOnce = true;
    const importer = (id: string, file: File) => importProjectImage(id, file, () => true);
    const partial = await saveImageSplit(importer, batch);
    expect(partial.items.filter((item) => item.error)).toHaveLength(1);
    const saved = partial.items.flatMap((item) => item.node ? [item.node] : []);
    expect((await listProjectAssets("a")).map((asset) => asset.assetId)).toEqual([original.assetId, ...saved.map((node) => node.metadata!.assetId)]);
    expect(files().size).toBe(4);
    const complete = await saveImageSplit(importer, partial);
    expect(complete.items.every((item) => item.node)).toBe(true);
    for (const node of saved) expect(complete.items.some((item) => item.node === node)).toBe(true);
    expect((await listProjectAssets("a"))).toHaveLength(5);
    expect(files().size).toBe(5);
    expect(files().has(original.storageKey!)).toBe(true);
    expect(await listProjectAssets("b")).toEqual([]);
});

test("crop results use the local project catalog without replacing the original asset", async () => {
    const original = await importProjectImage("a", file, () => true);
    const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "room", position: { x: 0, y: 0 }, width: 400, height: 300,
        metadata: { content: original.url, assetId: original.assetId, storageKey: original.storageKey, versionId: "version" } };
    const result = await createCroppedImageNode((id, cropFile) => importProjectImage(id, cropFile, () => true), "a", source, { x: 0, y: 0, width: 0.5, height: 0.5 });
    expect(result.metadata!.assetId).not.toBe(original.assetId);
    expect(result.metadata!.storageKey).not.toBe(original.storageKey);
    expect(result.metadata!.versionId).toBeUndefined();
    expect(source.metadata!.versionId).toBe("version");
    expect((await listProjectAssets("a")).map((asset) => asset.assetId)).toEqual([original.assetId, result.metadata!.assetId]);
    expect(await listProjectAssets("b")).toEqual([]);
});

test("failed crop catalog writes roll back only the new image and retain the original", async () => {
    const original = await importProjectImage("a", file, () => true);
    mocks.failWrite = true;
    const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "room", position: { x: 0, y: 0 }, width: 400, height: 300, metadata: { content: original.url } };
    await expect(createCroppedImageNode((id, cropFile) => importProjectImage(id, cropFile, () => true), "a", source, { x: 0, y: 0, width: 0.5, height: 0.5 })).rejects.toThrow("catalog write failed");
    expect([...catalog().keys()]).toEqual([original.assetId]);
    expect([...files().keys()]).toEqual([original.storageKey]);
});

test("mask annotations use the project catalog and preserve the source and its version", async () => {
    const original = await importProjectImage("a", file, () => true);
    const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "room", position: { x: 0, y: 0 }, width: 400, height: 400 * 640 / 960,
        metadata: { content: original.url, assetId: original.assetId, storageKey: original.storageKey, versionId: "version" } };
    const result = await createMaskImageNode((id, maskFile) => importProjectImage(id, maskFile, () => true), "a", source, "data:image/png;base64,bWFzaw==", "标注图");
    expect(result.metadata!.assetId).not.toBe(original.assetId);
    expect(result.metadata!.storageKey).not.toBe(original.storageKey);
    expect(result.metadata!.versionId).toBeUndefined();
    expect(source.metadata!.versionId).toBe("version");
    expect((await listProjectAssets("a")).map((asset) => asset.assetId)).toEqual([original.assetId, result.metadata!.assetId]);
    expect(await listProjectAssets("b")).toEqual([]);
});

test("failed mask catalog writes remove only the new file and allow retry", async () => {
    const original = await importProjectImage("a", file, () => true);
    const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "room", position: { x: 0, y: 0 }, width: 400, height: 300, metadata: { content: original.url } };
    const save = () => createMaskImageNode((id, maskFile) => importProjectImage(id, maskFile, () => true), "a", source, "data:image/png;base64,bWFzaw==", "标注图");
    mocks.failWrite = true;
    await expect(save()).rejects.toThrow("catalog write failed");
    expect([...catalog().keys()]).toEqual([original.assetId]);
    expect([...files().keys()]).toEqual([original.storageKey]);
    mocks.failWrite = false;
    const result = await save();
    expect((await listProjectAssets("a")).map((asset) => asset.assetId)).toEqual([original.assetId, result.metadata!.assetId]);
});

test("persists only durable metadata; lists by project and reconstructs URLs after module reload", async () => {
    const first = await importProjectImage("a", file, () => true);
    const second = await importProjectImage("b", file, () => true);
    expect(catalog().get(first.assetId)).not.toHaveProperty("url");
    expect(catalog().get(first.assetId)).toMatchObject({ assetId: first.assetId, projectId: "a", storageKey: first.storageKey, width: 960, height: 640 });
    vi.resetModules();
    const reloaded = await import("../src/services/canvas-project-assets");
    await configureReloadedAssetStorage();
    const [restored] = await reloaded.listProjectAssets("a");
    expect(restored).toMatchObject({ ...first, url: expect.stringMatching(/^blob:/) });
    expect(restored.url).not.toBe(first.url);
    expect((await reloaded.listProjectAssets("b")).map((asset) => asset.assetId)).toEqual([second.assetId]);
});

test("rejects unsupported images and deleted projects before uploading", async () => {
    await expect(importProjectImage("a", file, () => false)).rejects.toThrow("项目不存在");
    await expect(importProjectImage("a", new File([], "clip.mp4", { type: "video/mp4" }), () => true)).rejects.toThrow("仅接收图片");
    expect(mocks.upload).not.toHaveBeenCalled();
});

test("failed metadata writes roll back catalog and blob, emit no event and allow retry", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProjectAssets(listener);
    mocks.failWrite = true;
    await expect(importProjectImage("a", file, () => true)).rejects.toThrow("catalog write failed");
    expect(catalog().size).toBe(0);
    expect(files().size).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    mocks.failWrite = false;
    await importProjectImage("a", file, () => true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
});

test("upload failure or project deletion during upload never publishes a catalog entry", async () => {
    const upload = mocks.upload.getMockImplementation()!;
    mocks.upload.mockRejectedValueOnce(new Error("decode failed"));
    await expect(importProjectImage("a", file, () => true)).rejects.toThrow("decode failed");
    let active = true;
    mocks.upload.mockImplementationOnce(async () => { const image = await upload(); active = false; return image; });
    await expect(importProjectImage("a", file, () => active)).rejects.toThrow("项目不存在");
    expect(await listProjectAssets("a")).toEqual([]);
    expect(files().size).toBe(0);
});

test("cancelled image upload rolls back the completed local blob before catalog publication", async () => {
    const controller = new AbortController();
    mocks.stores.set("image_files", new Map());
    let complete!: () => void;
    mocks.upload.mockImplementationOnce(async (_file: File, signal?: AbortSignal) => {
        expect(signal).toBe(controller.signal);
        await new Promise<void>((resolve) => { complete = resolve; });
        const storageKey = "image:cancelled";
        files().set(storageKey, new Blob(["fixture"], { type: "image/png" }));
        return { storageKey, url: "blob:cancelled", width: 960, height: 640, bytes: 7, mimeType: "image/png" };
    });
    const pending = importProjectImage("a", file, () => true, undefined, controller.signal);
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
    controller.abort();
    complete();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(files().has("image:cancelled")).toBe(false);
    expect(catalog().size).toBe(0);
});

test.each(["video", "audio"] as const)("cancelled %s metadata read creates no project asset", async (kind) => {
    const controller = new AbortController();
    mocks.stores.set("media_files", new Map());
    mocks.stores.set("canvas_project_assets", new Map());
    mocks.onMetadata.mockImplementationOnce(() => controller.abort());
    const pending = kind === "video"
        ? importProjectVideo("a", videoFile, () => true, undefined, controller.signal)
        : importProjectAudio("a", audioFile, () => true, undefined, controller.signal);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(mediaFiles().size).toBe(0);
    expect(catalog().size).toBe(0);
});

test("missing image blobs are reported instead of returning stale preview URLs", async () => {
    const image = await importProjectImage("a", file, () => true);
    files().delete(image.storageKey!);
    await expect(listProjectAssets("a")).rejects.toThrow("项目素材文件不存在");
});

test("cleanup keeps live catalogs, node/version/global/history references and prunes only deleted projects", async () => {
    const images = await Promise.all(Array.from({ length: 6 }, (_, index) => importProjectImage(index ? "deleted" : "a", file, () => true)));
    mocks.stores.set("image_generation_logs", new Map([["log", { storageKey: images[4].storageKey }]]));
    await cleanupProjectAssets(() => ({
        projects: [{ id: "a" }, { id: "b", nodes: [{ metadata: { storageKey: images[1].storageKey } }], versions: [{ nodes: [{ metadata: { storageKey: images[2].storageKey } }] }] }],
        assets: [{ data: { storageKey: images[3].storageKey } }],
    }), localCleanupSteps);
    expect(catalog().size).toBe(1);
    images.slice(0, 5).forEach((image) => expect(files().has(image.storageKey!)).toBe(true));
    expect(files().has(images[5].storageKey!)).toBe(false);
});

test("cleanup accepts host-provided media steps and passes only live project assets", async () => {
    const live = await importProjectImage("a", file, () => true);
    const deleted = await importProjectImage("deleted", file, () => true);
    const cleanupImages = vi.fn().mockResolvedValue(undefined);
    const cleanupMedia = vi.fn().mockResolvedValue(undefined);
    await cleanupProjectAssets(() => ({ projects: [{ id: "a" }], assets: [], extra: { reason: "project-deleted" } }), { cleanupImages, cleanupMedia });
    expect(catalog().has(live.assetId)).toBe(true);
    expect(catalog().has(deleted.assetId)).toBe(false);
    expect(cleanupImages).toHaveBeenCalledWith(expect.objectContaining({ projectAssets: [expect.objectContaining({ assetId: live.assetId })], extra: { reason: "project-deleted" } }));
    expect(cleanupMedia).toHaveBeenCalledWith(expect.objectContaining({ projectAssets: [expect.objectContaining({ assetId: live.assetId })] }));
    expect(files().has(deleted.storageKey!)).toBe(true);
});

test("cleanup refreshes project and global references before each media store scan", async () => {
    const live = await importProjectImage("a", file, () => true);
    const addedLater = await importProjectImage("a", file, () => true);
    let projects = [{ id: "a" }];
    let globalAssets: unknown[] = [];
    const cleanupImages = vi.fn(async () => {
        globalAssets = [{ data: { storageKey: addedLater.storageKey } }];
    });
    const cleanupMedia = vi.fn().mockResolvedValue(undefined);

    await cleanupProjectAssets(() => ({ projects, assets: globalAssets }), { cleanupImages, cleanupMedia });

    expect(cleanupImages.mock.calls[0][0]).toMatchObject({ projects: [{ id: "a" }], assets: [] });
    expect(cleanupMedia.mock.calls[0][0]).toMatchObject({ projects: [{ id: "a" }], assets: [{ data: { storageKey: addedLater.storageKey } }] });
    expect(cleanupMedia.mock.calls[0][0].projectAssets).toEqual(expect.arrayContaining([
        expect.objectContaining({ assetId: live.assetId }),
        expect.objectContaining({ assetId: addedLater.assetId }),
    ]));
    expect(files().has(live.storageKey!)).toBe(true);
    expect(files().has(addedLater.storageKey!)).toBe(true);
});

test("catalog prune failure prevents image/media blob scans and leaves the catalog retryable", async () => {
    const deleted = await importProjectImage("deleted", file, () => true);
    const record = catalog().get(deleted.assetId);
    const cleanupImages = vi.fn().mockResolvedValue(undefined);
    const cleanupMedia = vi.fn().mockResolvedValue(undefined);
    const failingCatalog = {
        readAll: async () => [record],
        save: async () => undefined,
        remove: async () => { throw new Error("catalog remove failed"); },
    };

    await expect(cleanupProjectAssets(() => ({ projects: [], assets: [] }), { cleanupImages, cleanupMedia }, failingCatalog)).rejects.toThrow("catalog remove failed");

    expect(cleanupImages).not.toHaveBeenCalled();
    expect(cleanupMedia).not.toHaveBeenCalled();
    expect(catalog().has(deleted.assetId)).toBe(true);
    expect(files().has(deleted.storageKey!)).toBe(true);
});

test("cleanup waits for a pending import and reads the latest project state", async () => {
    const upload = mocks.upload.getMockImplementation()!;
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    mocks.upload.mockImplementationOnce(async () => { await gate; return upload(); });
    const importing = importProjectImage("a", file, () => true);
    let projects: { id: string }[] = [];
    const cleaning = cleanupProjectAssets(() => ({ projects, assets: [] }), localCleanupSteps);
    projects = [{ id: "a" }];
    finish();
    const image = await importing;
    await cleaning;
    expect(files().has(image.storageKey!)).toBe(true);
    expect(await listProjectAssets("a")).toHaveLength(1);
});

test("video metadata is durable and URLs are reconstructed only within their project", async () => {
    const video = await importProjectVideo("a", videoFile, () => true);
    const other = await importProjectVideo("b", videoFile, () => true);
    expect(video).toMatchObject({ kind: "VIDEO", projectId: "a", width: 1920, height: 1080, durationMs: 1500, bytes: videoFile.size });
    expect(catalog().get(video.assetId)).not.toHaveProperty("url");
    vi.resetModules();
    const reloaded = await import("../src/services/canvas-project-assets");
    await configureReloadedAssetStorage();
    expect(await reloaded.listProjectAssets("a")).toEqual([{ ...video, url: expect.stringMatching(/^blob:/) }]);
    expect((await reloaded.listProjectAssets("b"))[0].assetId).toBe(other.assetId);
    expect((await reloaded.listProjectAssets("a"))[0].url).not.toBe(video.url);
});

test("invalid video types, unreadable video and zero dimensions publish no file or catalog entry", async () => {
    await expect(importProjectVideo("a", file, () => true)).rejects.toThrow("仅接收视频");
    mocks.videoError = true;
    await expect(importProjectVideo("a", videoFile, () => true)).rejects.toThrow("无法读取视频");
    mocks.videoError = false;
    mocks.videoWidth = 0;
    await expect(importProjectVideo("a", videoFile, () => true)).rejects.toThrow("视频尺寸无效");
    expect(await listProjectAssets("a")).toEqual([]);
    expect(mediaFiles()?.size || 0).toBe(0);
});

test("video file and catalog writes roll back together and permit retry", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProjectAssets(listener);
    mocks.failMediaWrite = true;
    await expect(importProjectVideo("a", videoFile, () => true)).rejects.toThrow("media write failed");
    expect(mediaFiles().size).toBe(0);
    mocks.failMediaWrite = false;
    mocks.failWrite = true;
    await expect(importProjectVideo("a", videoFile, () => true)).rejects.toThrow("catalog write failed");
    expect(mediaFiles().size).toBe(0);
    expect(catalog().size).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    mocks.failWrite = false;
    await importProjectVideo("a", videoFile, () => true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
});

test("project deletion during video metadata loading leaves no imported asset", async () => {
    await expect(importProjectVideo("a", videoFile, () => false)).rejects.toThrow("项目不存在");
    let active = true;
    mocks.onMetadata.mockImplementationOnce(() => { active = false; });
    await expect(importProjectVideo("a", videoFile, () => active)).rejects.toThrow("项目不存在");
    expect(await listProjectAssets("a")).toEqual([]);
    expect(mediaFiles().size).toBe(0);
});

test("video cleanup protects live catalog, node, version and global references", async () => {
    const videos = await Promise.all(Array.from({ length: 5 }, (_, index) => importProjectVideo(index ? "deleted" : "a", videoFile, () => true)));
    await cleanupProjectAssets(() => ({
        projects: [{ id: "a" }, { id: "b", nodes: [{ metadata: { storageKey: videos[1].storageKey } }], versions: [{ nodes: [{ metadata: { storageKey: videos[2].storageKey } }] }] }],
        assets: [{ data: { storageKey: videos[3].storageKey } }],
    }), localCleanupSteps);
    expect(catalog().size).toBe(1);
    videos.slice(0, 4).forEach((video) => expect(mediaFiles().has(video.storageKey!)).toBe(true));
    expect(mediaFiles().has(videos[4].storageKey!)).toBe(false);
});

test("cleanup is ordered after video import and keeps its published file", async () => {
    const importing = importProjectVideo("a", videoFile, () => true);
    const cleaning = cleanupProjectAssets(() => ({ projects: [{ id: "a" }], assets: [] }), localCleanupSteps);
    const video = await importing;
    await cleaning;
    expect(mediaFiles().has(video.storageKey!)).toBe(true);
    expect((await listProjectAssets("a"))[0].assetId).toBe(video.assetId);
});

test("audio persists without image dimensions or temporary URLs and reconstructs only its project", async () => {
    const audio = await importProjectAudio("a", audioFile, () => true);
    const other = await importProjectAudio("b", audioFile, () => true);
    expect(audio).toMatchObject({ kind: "AUDIO", projectId: "a", durationMs: 1500, bytes: audioFile.size, mimeType: "audio/mpeg" });
    expect(audio).not.toHaveProperty("width");
    expect(audio).not.toHaveProperty("height");
    expect(catalog().get(audio.assetId)).not.toHaveProperty("url");
    vi.resetModules();
    const reloaded = await import("../src/services/canvas-project-assets");
    await configureReloadedAssetStorage();
    const [restored] = await reloaded.listProjectAssets("a");
    expect(restored).toEqual({ ...audio, url: expect.stringMatching(/^blob:/) });
    expect(restored.url).not.toBe(audio.url);
    expect((await reloaded.listProjectAssets("b"))[0].assetId).toBe(other.assetId);
});

test("unreadable or unsupported audio publishes nothing and releases the preview URL", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    try {
        await expect(importProjectAudio("a", file, () => true)).rejects.toThrow("仅接收音频");
        mocks.audioError = true;
        await expect(importProjectAudio("a", audioFile, () => true)).rejects.toThrow("无法读取音频");
        expect(revoke).toHaveBeenCalledOnce();
        expect(await listProjectAssets("a")).toEqual([]);
        expect(mediaFiles()?.size || 0).toBe(0);
    } finally { revoke.mockRestore(); }
});

test("extension-only MP3 and WAV files keep the existing audio import support", async () => {
    for (const name of ["narration.MP3", "narration.wav"]) {
        const audio = await importProjectAudio("a", new File(["fixture"], name), () => true);
        expect(audio).toMatchObject({ kind: "AUDIO", name, durationMs: 1500 });
    }
});

test("audio file and catalog write failures roll back, emit nothing and permit retry", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProjectAssets(listener);
    try {
        mocks.failMediaWrite = true;
        await expect(importProjectAudio("a", audioFile, () => true)).rejects.toThrow("media write failed");
        expect(mediaFiles().size).toBe(0);
        mocks.failMediaWrite = false;
        mocks.failWrite = true;
        await expect(importProjectAudio("a", audioFile, () => true)).rejects.toThrow("catalog write failed");
        expect(mediaFiles().size).toBe(0);
        expect(catalog().size).toBe(0);
        expect(listener).not.toHaveBeenCalled();
        mocks.failWrite = false;
        await importProjectAudio("a", audioFile, () => true);
        expect(listener).toHaveBeenCalledOnce();
    } finally { unsubscribe(); }
});

test("project deletion before or during audio import leaves no catalog or file", async () => {
    await expect(importProjectAudio("a", audioFile, () => false)).rejects.toThrow("项目不存在");
    let active = true;
    mocks.onMetadata.mockImplementationOnce(() => { active = false; });
    await expect(importProjectAudio("a", audioFile, () => active)).rejects.toThrow("项目不存在");
    expect(await listProjectAssets("a")).toEqual([]);
    expect(mediaFiles().size).toBe(0);
});

test("audio cleanup protects catalog, node, version and global references", async () => {
    const audios = await Promise.all(Array.from({ length: 5 }, (_, index) => importProjectAudio(index ? "deleted" : "a", audioFile, () => true)));
    await cleanupProjectAssets(() => ({
        projects: [{ id: "a" }, { id: "b", nodes: [{ metadata: { storageKey: audios[1].storageKey } }], versions: [{ nodes: [{ metadata: { storageKey: audios[2].storageKey } }] }] }],
        assets: [{ data: { storageKey: audios[3].storageKey } }],
    }), localCleanupSteps);
    expect(catalog().size).toBe(1);
    audios.slice(0, 4).forEach((audio) => expect(mediaFiles().has(audio.storageKey!)).toBe(true));
    expect(mediaFiles().has(audios[4].storageKey!)).toBe(false);
});

test("cleanup waits for audio publication and missing files report an error after reload", async () => {
    const importing = importProjectAudio("a", audioFile, () => true);
    const cleaning = cleanupProjectAssets(() => ({ projects: [{ id: "a" }], assets: [] }), localCleanupSteps);
    const audio = await importing;
    await cleaning;
    expect(mediaFiles().has(audio.storageKey!)).toBe(true);
    mediaFiles().delete(audio.storageKey!);
    vi.resetModules();
    const reloaded = await import("../src/services/canvas-project-assets");
    await configureReloadedAssetStorage();
    await expect(reloaded.listProjectAssets("a")).rejects.toThrow("项目素材文件不存在");
});
