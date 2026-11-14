import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
    return { persistence: vi.fn(), upload: vi.fn() };
});
vi.mock("@infinite-canvas/core/provider-media-persistence", () => ({ getProviderMediaPersistence: mocks.persistence }));
vi.mock("@infinite-canvas/core/provider/audio-generation", () => ({ audioMimeType: (format: string) => format === "wav" ? "audio/wav" : "audio/mpeg" }));
vi.mock("../../web/src/i18n", () => ({ default: { t: (key: string) => key } }));

import { storeGeneratedAudio, storeGeneratedVideo } from "../../web/src/services/api/canvas/generated-media-storage";

beforeEach(() => {
    vi.resetAllMocks();
    mocks.persistence.mockResolvedValue({ uploadMedia: mocks.upload });
    mocks.upload.mockResolvedValue({ url: "blob:stored", storageKey: "video:stored", bytes: 5, mimeType: "video/mp4" });
});

test("web audio storage normalizes missing MIME and delegates upload to the host", async () => {
    const source = new Blob(["audio"]);
    await storeGeneratedAudio(source, "wav");
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ type: "audio/wav" }), "audio");

    const encoded = new Blob(["audio"], { type: "audio/ogg" });
    await storeGeneratedAudio(encoded, "wav");
    expect(mocks.upload).toHaveBeenLastCalledWith(encoded, "audio");
});

test("web video storage uploads blobs and preserves the existing URL fallback", async () => {
    const blob = new Blob(["video"], { type: "video/mp4" });
    await expect(storeGeneratedVideo({ blob })).resolves.toMatchObject({ storageKey: "video:stored" });
    expect(mocks.upload).toHaveBeenCalledWith(blob, "video");

    mocks.upload.mockRejectedValueOnce(new Error("upload failed"));
    await expect(storeGeneratedVideo({ url: "https://provider.invalid/result.mp4" })).resolves.toEqual({
        url: "https://provider.invalid/result.mp4",
        storageKey: "",
        bytes: 0,
        mimeType: "video/mp4",
    });
});

test("web video storage reports a missing playable result", async () => {
    await expect(storeGeneratedVideo({})).rejects.toThrow("没有返回可播放的视频");
    expect(mocks.upload).not.toHaveBeenCalled();
});
