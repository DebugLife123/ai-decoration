import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getImageBlob: vi.fn(), resolveImageUrl: vi.fn(), uploadImage: vi.fn(), deleteStoredImages: vi.fn(),
    getMediaBlob: vi.fn(), resolveMediaUrl: vi.fn(), uploadMediaFile: vi.fn(), deleteStoredMedia: vi.fn(),
}));
vi.mock("@/lib/localforage-storage", () => ({ localForageStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() } }));
vi.mock("@/services/image-storage", () => ({ getImageBlob: mocks.getImageBlob, resolveImageUrl: mocks.resolveImageUrl, uploadImage: mocks.uploadImage, deleteStoredImages: mocks.deleteStoredImages }));
vi.mock("@/services/file-storage", () => ({ getMediaBlob: mocks.getMediaBlob, resolveMediaUrl: mocks.resolveMediaUrl, uploadMediaFile: mocks.uploadMediaFile, deleteStoredMedia: mocks.deleteStoredMedia }));

import { localCanvasWorkspacePersistence } from "../../../web/src/services/api/canvas/local-workspace-persistence";

afterEach(() => vi.resetAllMocks());

const image = { id: "image-a", kind: "image" as const, title: "room", coverUrl: "blob:cover", category: "空间", tags: ["客厅"], createdAt: "now", updatedAt: "now", data: { dataUrl: "blob:image", storageKey: "image:key", width: 100, height: 80, bytes: 4, mimeType: "image/png" } };
const video = { id: "video-a", kind: "video" as const, title: "clip", coverUrl: "", tags: [], createdAt: "now", updatedAt: "now", data: { url: "blob:video", storageKey: "video:key", width: 100, height: 80, bytes: 4, mimeType: "video/mp4" } };

test("local workspace persistence clones text, image and video assets through local storage", async () => {
    mocks.getImageBlob.mockResolvedValue(new Blob(["image"]));
    mocks.uploadImage.mockResolvedValue({ url: "blob:cloned-image", storageKey: "image:clone", width: 120, height: 90, bytes: 5, mimeType: "image/png" });
    mocks.getMediaBlob.mockResolvedValue(new Blob(["video"]));
    mocks.uploadMediaFile.mockResolvedValue({ url: "blob:cloned-video", storageKey: "workspace-video:clone", width: 640, height: 360, bytes: 6, mimeType: "video/mp4" });
    const text = { id: "text-a", kind: "text" as const, title: "notes", coverUrl: "", tags: [], createdAt: "now", updatedAt: "now", data: { content: "brief" } };
    await expect(localCanvasWorkspacePersistence.cloneAssetDraft(text)).resolves.toMatchObject({ kind: "text", data: { content: "brief" } });
    await expect(localCanvasWorkspacePersistence.cloneAssetDraft(image)).resolves.toMatchObject({ coverUrl: "blob:cloned-image", data: { dataUrl: "blob:cloned-image", storageKey: "image:clone" } });
    await expect(localCanvasWorkspacePersistence.cloneAssetDraft(video, "workspace")).resolves.toMatchObject({ data: { url: "blob:cloned-video", storageKey: "workspace-video:clone" } });
    expect(mocks.uploadMediaFile).toHaveBeenCalledWith(expect.any(Blob), "workspace-video");
});

test("local workspace persistence restores URLs and deletes only image/video storage keys", async () => {
    mocks.resolveImageUrl.mockResolvedValue("blob:restored-image");
    mocks.resolveMediaUrl.mockResolvedValue("blob:restored-video");
    await expect(localCanvasWorkspacePersistence.resolveAssetUrls(image)).resolves.toMatchObject({ coverUrl: "blob:restored-image", data: { dataUrl: "blob:restored-image" } });
    await expect(localCanvasWorkspacePersistence.resolveAssetUrls(video)).resolves.toMatchObject({ data: { url: "blob:restored-video" } });
    await localCanvasWorkspacePersistence.deleteAssets([image, video]);
    expect(mocks.deleteStoredImages).toHaveBeenCalledWith(["image:key"]);
    expect(mocks.deleteStoredMedia).toHaveBeenCalledWith(["video:key"]);
});
