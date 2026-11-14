import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), resolveImage: vi.fn(), uploadImage: vi.fn(), resolveMedia: vi.fn() }));
vi.mock("@/lib/localforage-storage", () => ({ localForageStorage: { getItem: mocks.getItem, setItem: mocks.setItem, removeItem: mocks.removeItem } }));
vi.mock("@/services/image-storage", () => ({ resolveImageUrl: mocks.resolveImage, uploadImage: mocks.uploadImage }));
vi.mock("@/services/file-storage", () => ({ resolveMediaUrl: mocks.resolveMedia }));

import { localCanvasAssetStorePersistence } from "../../../web/src/services/api/canvas/local-asset-store";

beforeEach(() => vi.clearAllMocks());

const image = { id: "image-a", kind: "image" as const, title: "room", coverUrl: "blob:old-cover", tags: [], createdAt: "now", updatedAt: "now", data: { dataUrl: "blob:old-image", storageKey: "image:key", width: 1, height: 1, bytes: 1, mimeType: "image/png" } };
const video = { id: "video-a", kind: "video" as const, title: "clip", coverUrl: "", tags: [], createdAt: "now", updatedAt: "now", data: { url: "blob:old-video", storageKey: "video:key", width: 1, height: 1, bytes: 1, mimeType: "video/mp4" } };

test("local asset persistence delegates unchanged storage operations", async () => {
    mocks.getItem.mockResolvedValue("serialized");
    mocks.setItem.mockResolvedValue(undefined);
    mocks.removeItem.mockResolvedValue(undefined);
    await expect(localCanvasAssetStorePersistence.getItem("assets")).resolves.toBe("serialized");
    await localCanvasAssetStorePersistence.setItem("assets", "next");
    await localCanvasAssetStorePersistence.removeItem("assets");
    expect(mocks.getItem).toHaveBeenCalledWith("assets");
    expect(mocks.setItem).toHaveBeenCalledWith("assets", "next");
    expect(mocks.removeItem).toHaveBeenCalledWith("assets");
});

test("local asset persistence normalizes synchronous fallback storage results to promises", async () => {
    mocks.getItem.mockReturnValue("serialized");
    mocks.setItem.mockReturnValue(undefined);
    mocks.removeItem.mockReturnValue(undefined);
    await expect(localCanvasAssetStorePersistence.getItem("assets")).resolves.toBe("serialized");
    await expect(localCanvasAssetStorePersistence.setItem("assets", "next")).resolves.toBeUndefined();
    await expect(localCanvasAssetStorePersistence.removeItem("assets")).resolves.toBeUndefined();
});

test("local asset persistence rebuilds saved image/video URLs and migrates legacy image data URLs", async () => {
    mocks.resolveImage.mockResolvedValueOnce("blob:new-cover").mockResolvedValueOnce("blob:new-image");
    mocks.resolveMedia.mockResolvedValue("blob:new-video");
    mocks.uploadImage.mockResolvedValue({ url: "blob:migrated", storageKey: "image:migrated", bytes: 4, mimeType: "image/png" });
    const legacy = { ...image, id: "legacy", coverUrl: "data:image/png;base64,old", data: { ...image.data, dataUrl: "data:image/png;base64,old", storageKey: undefined } };
    const restored = await localCanvasAssetStorePersistence.restoreAssets([image, video, legacy]);
    expect(restored[0]).toMatchObject({ coverUrl: "blob:new-cover", data: { dataUrl: "blob:new-image" } });
    expect(restored[1]).toMatchObject({ data: { url: "blob:new-video" } });
    expect(restored[2]).toMatchObject({ coverUrl: "blob:migrated", data: { dataUrl: "blob:migrated", storageKey: "image:migrated" } });
    expect(mocks.uploadImage).toHaveBeenCalledWith("data:image/png;base64,old");
});

test("local asset persistence leaves text and URL-only assets unchanged", async () => {
    const text = { id: "text-a", kind: "text" as const, title: "notes", coverUrl: "", tags: [], createdAt: "now", updatedAt: "now", data: { content: "requirements" } };
    const urlImage = { ...image, id: "url-image", coverUrl: "https://example.test/cover.png", data: { ...image.data, dataUrl: "https://example.test/image.png", storageKey: undefined } };
    await expect(localCanvasAssetStorePersistence.restoreAssets([text, urlImage])).resolves.toEqual([text, urlImage]);
    expect(mocks.resolveImage).not.toHaveBeenCalled();
    expect(mocks.uploadImage).not.toHaveBeenCalled();
});
