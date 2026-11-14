import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { importCanvasResultAudio, importCanvasResultVideo } from "../src/services/api/canvas/result-media";
import { canvasAssetMetadata } from "../src/features/canvas/asset-import";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

const videoBlob = new Blob(["video"], { type: "video/mp4" });
const audioBlob = new Blob(["audio"], { type: "audio/mpeg" });
const base = { projectId: "project", name: "result", url: "blob:result", bytes: 5, createdAt: "fixture", durationMs: 1500 };
const video = { ...base, assetId: "video", kind: "VIDEO" as const, mimeType: "video/mp4", width: 1920, height: 1080 };
const audio = { ...base, assetId: "audio", kind: "AUDIO" as const, mimeType: "audio/mpeg" };
const importVideo = vi.fn(async (_projectId: string, _file: File) => video);
const importAudio = vi.fn(async (_projectId: string, _file: File) => audio);
const readMedia = vi.fn<CanvasMediaAdapter["readMedia"]>();
const media = { readMedia } as CanvasMediaAdapter;
const save = (kind: "video" | "audio", signal?: AbortSignal) => kind === "video"
    ? importCanvasResultVideo(media, importVideo, "project", { blob: videoBlob }, "result.mp4", signal)
    : importCanvasResultAudio(importAudio, "project", audioBlob, "result.mp3", "mp3", signal);

beforeEach(() => {
    importVideo.mockReset().mockResolvedValue(video);
    importAudio.mockReset().mockResolvedValue(audio);
    readMedia.mockReset().mockResolvedValue(videoBlob);
});
afterEach(() => vi.unstubAllGlobals());

test.each(["video", "audio"] as const)("%s results use the host and publish project identity without stale task/version IDs", async (kind) => {
    const result = await save(kind);
    const importer = kind === "video" ? importVideo : importAudio;
    expect(result).toBe(kind === "video" ? video : audio);
    expect(importer).toHaveBeenCalledWith("project", expect.any(File));
    const file = importer.mock.calls[0][1];
    expect(await file.text()).toBe(kind);
    expect(file.type).toBe(result.mimeType);
    expect(readMedia).not.toHaveBeenCalled();
    expect(canvasAssetMetadata(result)).toMatchObject({ assetId: kind, durationMs: 1500, taskId: undefined, versionId: undefined, videoTaskId: undefined });
    expect(canvasAssetMetadata(result).naturalWidth).toBe(kind === "video" ? 1920 : undefined);
});

test.each(["https://media.example/result.mp4", "blob:result", "data:video/mp4;base64,dmlkZW8="])("video URL %s is read by the host with cancellation", async (url) => {
    const controller = new AbortController();
    await importCanvasResultVideo(media, importVideo, "project", { url }, "result.mp4", controller.signal);
    expect(readMedia).toHaveBeenCalledWith("project", { name: "result.mp4", url }, controller.signal);
    expect(importVideo).toHaveBeenCalledOnce();
});

test("failed host video reads cannot masquerade as saved remote URLs", async () => {
    readMedia.mockRejectedValueOnce(new Error("HTTP 502"));
    await expect(importCanvasResultVideo(media, importVideo, "project", { url: "https://media.example/result" }, "result.mp4")).rejects.toThrow("HTTP 502");
    readMedia.mockRejectedValueOnce(new Error("network failed"));
    await expect(importCanvasResultVideo(media, importVideo, "project", { url: "https://media.example/result" }, "result.mp4")).rejects.toThrow("network failed");
    expect(importVideo).not.toHaveBeenCalled();
});

test("missing video bytes and unsupported hosts do not read or write", async () => {
    await expect(importCanvasResultVideo(media, undefined, "project", { url: "https://media.example/result" }, "result.mp4")).rejects.toThrow("不支持视频导入");
    await expect(importCanvasResultAudio(undefined, "project", audioBlob, "result.mp3", "mp3")).rejects.toThrow("不支持音频导入");
    await expect(importCanvasResultVideo(media, importVideo, "project", {}, "result.mp4")).rejects.toThrow("没有可导入的视频结果");
    expect(readMedia).not.toHaveBeenCalled();
    expect(importVideo).not.toHaveBeenCalled();
    expect(importAudio).not.toHaveBeenCalled();
});

test.each(["text/html", "application/json", "image/png"])("nonmedia %s is rejected before persistence", async (type) => {
    const blob = new Blob(["error"], { type });
    await expect(importCanvasResultVideo(media, importVideo, "project", { blob, mimeType: "video/mp4" }, "result.mp4")).rejects.toThrow("不是可导入的视频");
    await expect(importCanvasResultAudio(importAudio, "project", blob, "result.mp3", "mp3")).rejects.toThrow("不是可导入的音频");
    expect(importVideo).not.toHaveBeenCalled();
    expect(importAudio).not.toHaveBeenCalled();
});

test.each(["", "application/octet-stream"])("generic MIME %s uses provider/format information and still goes through host decoding", async (type) => {
    const blob = new Blob(["bytes"], { type });
    const videoHost = vi.fn().mockResolvedValue(video);
    const audioHost = vi.fn().mockResolvedValue(audio);
    await importCanvasResultVideo(media, videoHost, "project", { blob, mimeType: "video/webm" }, "result.webm");
    await importCanvasResultAudio(audioHost, "project", blob, "result.wav", "wav");
    expect(videoHost.mock.calls[0][1]).toMatchObject({ type: "video/webm", name: "result.webm" });
    expect(audioHost.mock.calls[0][1]).toMatchObject({ type: "audio/wav", name: "result.wav" });
});

test.each(["video", "audio"] as const)("%s cancellation before import or during persistence prevents stale publication", async (kind) => {
    const controller = new AbortController();
    controller.abort();
    await expect(save(kind, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(importVideo).not.toHaveBeenCalled();
    expect(importAudio).not.toHaveBeenCalled();
    const pending = new AbortController();
    importVideo.mockImplementationOnce(async () => { pending.abort(); return video; });
    importAudio.mockImplementationOnce(async () => { pending.abort(); return audio; });
    await expect(save(kind, pending.signal)).rejects.toMatchObject({ name: "AbortError" });
});

test("video cancellation during host result reading never reaches the importer", async () => {
    for (const stage of ["read", "after-read"]) {
        const controller = new AbortController();
        readMedia.mockImplementationOnce(async (_projectId, _reference, signal) => {
            if (stage === "read") controller.abort();
            signal.throwIfAborted();
            controller.abort();
            return videoBlob;
        });
        await expect(importCanvasResultVideo(media, importVideo, "project", { url: "blob:result" }, "result.mp4", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    }
    expect(importVideo).not.toHaveBeenCalled();
});

test.each(["video", "audio"] as const)("%s save failures preserve the reason and allow explicit retry", async (kind) => {
    importVideo.mockRejectedValueOnce(new Error("catalog write failed"));
    importAudio.mockRejectedValueOnce(new Error("catalog write failed"));
    await expect(save(kind)).rejects.toThrow("catalog write failed");
    expect((await save(kind)).assetId).toBe(kind);
});

test.each(["project", "kind"])("foreign %s from a host is rejected", async (field) => {
    const videoHost = vi.fn().mockResolvedValue({ ...video, ...(field === "project" ? { projectId: "other" } : { kind: "AUDIO" }) });
    const audioHost = vi.fn().mockResolvedValue({ ...audio, ...(field === "project" ? { projectId: "other" } : { kind: "VIDEO" }) });
    await expect(importCanvasResultVideo(media, videoHost, "project", { blob: videoBlob }, "result.mp4")).rejects.toThrow("与当前项目或类型不符");
    await expect(importCanvasResultAudio(audioHost, "project", audioBlob, "result.mp3", "mp3")).rejects.toThrow("与当前项目或类型不符");
});
