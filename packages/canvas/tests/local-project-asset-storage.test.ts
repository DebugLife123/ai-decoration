import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    imageToDataUrl: vi.fn(), uploadImage: vi.fn(), uploadVideoFile: vi.fn(), uploadAudioFile: vi.fn(), cleanupUnusedImages: vi.fn(), cleanupUnusedMedia: vi.fn(), getImageBlob: vi.fn(), resolveImageUrl: vi.fn(), getMediaBlob: vi.fn(), resolveMediaUrl: vi.fn(),
}));
vi.mock("@/services/image-storage", () => ({ uploadImage: mocks.uploadImage, deleteStoredImages: vi.fn(), resolveImageUrl: mocks.resolveImageUrl, getImageBlob: mocks.getImageBlob, imageToDataUrl: mocks.imageToDataUrl, cleanupUnusedImages: mocks.cleanupUnusedImages }));
vi.mock("@/services/file-storage", () => ({ uploadVideoFile: mocks.uploadVideoFile, uploadAudioFile: mocks.uploadAudioFile, deleteStoredMedia: vi.fn(), resolveMediaUrl: mocks.resolveMediaUrl, cleanupUnusedMedia: mocks.cleanupUnusedMedia, getMediaBlob: mocks.getMediaBlob }));
vi.mock("@infinite-canvas/core/stores/config", () => ({ withLocalProxy: (url: string) => url.startsWith("https://") ? `proxy:${url}` : url }));

import { localCanvasProjectAssetStorage } from "../../../web/src/services/api/canvas/local-project-asset-storage";

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

test("project asset uploads pass cancellation through to existing local storage", async () => {
    const signal = new AbortController().signal;
    const file = new File(["fixture"], "room.png", { type: "image/png" });
    await localCanvasProjectAssetStorage.uploadImage(file, signal);
    await localCanvasProjectAssetStorage.uploadVideo(file, signal);
    await localCanvasProjectAssetStorage.uploadAudio(file, signal);
    expect(mocks.uploadImage).toHaveBeenCalledWith(file, { signal });
    expect(mocks.uploadVideoFile).toHaveBeenCalledWith(file, signal);
    expect(mocks.uploadAudioFile).toHaveBeenCalledWith(file, signal);
});

test("image reads and reference-aware cleanup are delegated to the local persistence implementation", async () => {
    const image = { dataUrl: "blob:image", storageKey: "image:room" };
    const signal = new AbortController().signal;
    mocks.imageToDataUrl.mockResolvedValue("data:image/png;base64,room");
    await expect(localCanvasProjectAssetStorage.readImage(image, signal)).resolves.toBe("data:image/png;base64,room");
    expect(mocks.imageToDataUrl).toHaveBeenCalledWith(image, { signal });
    await localCanvasProjectAssetStorage.cleanupImages({ projects: [] });
    await localCanvasProjectAssetStorage.cleanupMedia({ projects: [] });
    expect(mocks.cleanupUnusedImages).toHaveBeenCalledWith({ projects: [] });
    expect(mocks.cleanupUnusedMedia).toHaveBeenCalledWith({ projects: [] });
});

test("media reads prefer the stored blob without resolving a URL or fetching", async () => {
    const blob = new Blob(["stored"], { type: "video/mp4" });
    mocks.getMediaBlob.mockResolvedValue(blob);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "room.mp4", storageKey: "video:room", url: "blob:old" })).resolves.toBe(blob);
    expect(mocks.getMediaBlob).toHaveBeenCalledWith("video:room");
    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});

test("media reader also handles image storage keys for project and result export", async () => {
    const blob = new Blob(["image"], { type: "image/png" });
    mocks.getImageBlob.mockResolvedValue(blob);
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "room.png", storageKey: "image:room" })).resolves.toBe(blob);
    expect(mocks.getImageBlob).toHaveBeenCalledWith("image:room");
    expect(mocks.getMediaBlob).not.toHaveBeenCalled();
});

test("project archive byte reads return the stored blob or null without URL fallback", async () => {
    const blob = new Blob(["archive"], { type: "image/png" });
    mocks.getImageBlob.mockResolvedValueOnce(blob).mockResolvedValueOnce(null);
    await expect(localCanvasProjectAssetStorage.readStoredBlob("image:room")).resolves.toBe(blob);
    await expect(localCanvasProjectAssetStorage.readStoredBlob("image:missing")).resolves.toBeNull();
    expect(mocks.resolveImageUrl).not.toHaveBeenCalled();
});

test("missing image bytes resolve the existing image URL before fetching", async () => {
    const blob = new Blob(["image"]);
    mocks.getImageBlob.mockResolvedValue(null);
    mocks.resolveImageUrl.mockResolvedValue("blob:restored-image");
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "room.png", storageKey: "image:room" }, signal)).resolves.toBe(blob);
    expect(fetch).toHaveBeenCalledWith("blob:restored-image", { signal });
});

test("URL-only HTTPS references preserve the local proxy boundary", async () => {
    const blob = new Blob(["remote"]);
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetch);
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "result.png", url: "https://images.example/result.png" })).resolves.toBe(blob);
    expect(fetch).toHaveBeenCalledWith("proxy:https://images.example/result.png", { signal: undefined });
});

test("missing media bytes resolve the existing URL and forward cancellation to fetch", async () => {
    const blob = new Blob(["restored"]);
    mocks.getMediaBlob.mockResolvedValue(null);
    mocks.resolveMediaUrl.mockResolvedValue("blob:restored");
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "room.mp4", storageKey: "video:room", url: "blob:old" }, signal)).resolves.toBe(blob);
    expect(mocks.resolveMediaUrl).toHaveBeenCalledWith("video:room", "blob:old");
    expect(fetch).toHaveBeenCalledWith("blob:restored", { signal });
});

test("URL-only references bypass storage and missing sources report a readable error", async () => {
    const blob = new Blob(["audio"]);
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetch);
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "voice.mp3", url: "blob:audio" })).resolves.toBe(blob);
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "missing.mp3" })).rejects.toThrow("无法读取参考素材：missing.mp3");
    expect(mocks.getMediaBlob).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
});

test("non-success HTTP responses are rejected before exposing an error body as media", async () => {
    mocks.getMediaBlob.mockResolvedValue(null);
    mocks.resolveMediaUrl.mockResolvedValue("https://media.example/result.mp4");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, blob: async () => new Blob(["gateway error"]) }));
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "result.mp4", storageKey: "video:result" })).rejects.toThrow("媒体读取失败（HTTP 502）");
});

test("cancelled reads stop before storage and cancellation during storage stops URL fallback", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "room.mp4", storageKey: "video:room" }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.getMediaBlob).not.toHaveBeenCalled();

    const duringRead = new AbortController();
    mocks.getMediaBlob.mockImplementationOnce(async () => { duringRead.abort(); return null; });
    await expect(localCanvasProjectAssetStorage.readMedia({ name: "room.mp4", storageKey: "video:room" }, duringRead.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled();
});
