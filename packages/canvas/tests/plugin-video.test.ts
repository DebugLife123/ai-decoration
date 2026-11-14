import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { generateCanvasPluginVideo } from "../src/services/api/canvas/plugin-video";
import type { CanvasImportedVideo } from "../src/features/canvas/contracts";
import type { CanvasVideoGeneration } from "../src/features/canvas/video-generation";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";
import type { ReferenceImage } from "../src/types/image";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

const blob = new Blob(["video"], { type: "video/mp4" });
const asset: CanvasImportedVideo = { projectId: "project", assetId: "plugin-result", name: "plugin-video.mp4", kind: "VIDEO", mimeType: "video/mp4", url: "blob:saved", width: 640, height: 360, durationMs: 1200, bytes: 5, createdAt: "fixture", storageKey: "video:saved" };
const create = vi.fn<CanvasVideoGeneration["create"]>();
const wait = vi.fn<CanvasVideoGeneration["wait"]>();
const videoGeneration: CanvasVideoGeneration = { create, wait };
const readImage = vi.fn<CanvasMediaAdapter["readImage"]>();
const readMedia = vi.fn<CanvasMediaAdapter["readMedia"]>();
const media: CanvasMediaAdapter = { readImage, readMedia, restore: async (_id, snapshot) => snapshot, cleanup() {} };
const source: ReferenceImage = { id: "source", name: "room.png", type: "image/png", dataUrl: "blob:source", storageKey: "image:source" };
const importVideo = vi.fn(async (_projectId: string, _file: File) => asset);
const settings = { model: "video-fixture", size: "16:9", seconds: "8", quality: "720", generateAudio: "true", watermark: "false", mode: "reference" };
const run = (signal = new AbortController().signal, references: ReferenceImage[] = []) => generateCanvasPluginVideo(media, "project", importVideo, videoGeneration, settings, "room", references, signal);

beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: "provider-task", provider: "openai", model: "video-fixture" });
    wait.mockReset().mockResolvedValue({ blob });
    readImage.mockReset().mockImplementation(async (_id, image) => `data:${image.type};base64,${image.id}`);
    readMedia.mockReset().mockResolvedValue(blob);
    importVideo.mockReset().mockResolvedValue(asset);
});
afterEach(() => vi.unstubAllGlobals());

test("plugin video uses the project importer and preserves the SDK result fields", async () => {
    const signal = new AbortController().signal;
    expect(await run(signal)).toEqual({ url: "blob:saved", mimeType: "video/mp4", width: 640, height: 360, durationMs: 1200 });
    expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId: "project", prompt: "room", references: [] }), signal);
    expect(wait).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId: "project" }), { id: "provider-task", provider: "openai", model: "video-fixture" }, signal);
    expect(readImage).not.toHaveBeenCalled();
    expect(importVideo).toHaveBeenCalledWith("project", expect.any(File));
    expect(await importVideo.mock.calls[0][1].text()).toBe("video");
    expect(importVideo.mock.calls[0][1].name).toBe("plugin-video.mp4");
    expect(readMedia).not.toHaveBeenCalled();
});

test("missing host capability rejects before any model request", async () => {
    await expect(generateCanvasPluginVideo(media, "project", undefined, videoGeneration, settings, "room", [source], new AbortController().signal)).rejects.toThrow("不支持视频导入");
    expect(readImage).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(readMedia).not.toHaveBeenCalled();
});

test("a remote result is read through the host before import", async () => {
    wait.mockResolvedValue({ url: "https://example.test/video.mp4" });
    const signal = new AbortController().signal;
    expect((await run(signal)).url).toBe("blob:saved");
    expect(readMedia).toHaveBeenCalledExactlyOnceWith("project", { name: "plugin-video.mp4", url: "https://example.test/video.mp4" }, signal);
    expect(importVideo).toHaveBeenCalledOnce();
});

test("model failure does not read or import any result", async () => {
    create.mockRejectedValue(new Error("provider failed"));
    await expect(run()).rejects.toThrow("provider failed");
    expect(importVideo).not.toHaveBeenCalled();
    expect(readMedia).not.toHaveBeenCalled();
});

test.each(["read", "save"])("%s failure is not reported as a playable remote URL", async (stage) => {
    wait.mockResolvedValue({ url: "https://example.test/video.mp4" });
    if (stage === "read") readMedia.mockRejectedValue(new Error("video read failed"));
    else importVideo.mockRejectedValue(new Error("save failed"));
    await expect(run()).rejects.toThrow(stage === "read" ? "video read failed" : "save failed");
});

test.each(["before", "provider", "read", "save"])("cancellation at %s prevents publishing plugin results", async (stage) => {
    const controller = new AbortController();
    if (stage === "before") controller.abort();
    if (stage === "provider") create.mockImplementation(async () => { controller.abort(); return { id: "provider-task", provider: "openai", model: "video-fixture" }; });
    if (stage === "read") {
        wait.mockResolvedValue({ url: "https://example.test/video.mp4" });
        readMedia.mockImplementation(async () => { controller.abort(); return blob; });
    }
    if (stage === "save") importVideo.mockImplementation(async () => { controller.abort(); return asset; });
    await expect(run(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    if (stage === "before") expect(create).not.toHaveBeenCalled();
    if (stage !== "save") expect(importVideo).not.toHaveBeenCalled();
    else expect(importVideo).toHaveBeenCalledOnce();
});

test.each(["project", "kind"])("foreign %s from the importer is rejected", async (field) => {
    importVideo.mockResolvedValue({ ...asset, ...(field === "project" ? { projectId: "other" } : { kind: "AUDIO" }) } as CanvasImportedVideo);
    await expect(run()).rejects.toThrow("与当前项目或类型不符");
});

test("explicit retry repeats the provider call; there is no automatic retry or new version", async () => {
    importVideo.mockRejectedValueOnce(new Error("save failed"));
    await expect(run()).rejects.toThrow("save failed");
    expect(create).toHaveBeenCalledOnce();
    expect((await run()).url).toBe(asset.url);
    expect(create).toHaveBeenCalledTimes(2);
    expect(asset).not.toHaveProperty("versionId");
});

test("plugin video reads image references through the host in order without changing their identities", async () => {
    const references = [source, { ...source, id: "second", storageKey: "image:second" }];
    const original = structuredClone(references);
    const signal = new AbortController().signal;
    await run(signal, references);
    expect(readImage.mock.calls).toEqual(references.map((image) => ["project", image, signal]));
    expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ references: references.map((image) => ({ ...image, dataUrl: `data:${image.type};base64,${image.id}` })) }), signal);
    expect(references).toEqual(original);
});

test("video provider waits for every image reference", async () => {
    let complete!: (url: string) => void;
    readImage.mockImplementation(async (_id, image) => image.id === "source" ? "data:image/png;base64,source" : new Promise((resolve) => { complete = resolve; }));
    const pending = run(undefined, [source, { ...source, id: "second" }]);
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
    complete("data:image/png;base64,second");
    await pending;
    expect(create.mock.calls[0][0].references.map((image) => image.dataUrl)).toEqual(["data:image/png;base64,source", "data:image/png;base64,second"]);
});

test.each(["failure", "empty"])("%s image reads prevent video generation and import without automatic retry", async (stage) => {
    if (stage === "failure") readImage.mockRejectedValue(new Error("read failed"));
    else readImage.mockResolvedValue("");
    await expect(run(undefined, [source])).rejects.toThrow(stage === "failure" ? "read failed" : "canvas.projectPage.referenceMissing");
    expect(readImage).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    expect(importVideo).not.toHaveBeenCalled();
});

test("a late image read after cancellation cannot start video generation", async () => {
    const controller = new AbortController();
    let complete!: (url: string) => void;
    readImage.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const pending = run(controller.signal, [source]);
    controller.abort();
    complete("data:image/png;base64,late");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(create).not.toHaveBeenCalled();
    expect(importVideo).not.toHaveBeenCalled();
});

test("explicit retry re-reads video image inputs before submitting", async () => {
    readImage.mockRejectedValueOnce(new Error("read failed"));
    await expect(run(undefined, [source])).rejects.toThrow("read failed");
    expect(create).not.toHaveBeenCalled();
    await run(undefined, [source]);
    expect(readImage).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledOnce();
});
