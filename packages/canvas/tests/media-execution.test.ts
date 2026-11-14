import { describe, expect, test, vi } from "vitest";
import { executeCanvasAudioTask } from "../src/features/canvas/audio-execution";
import { executeCanvasVideoTask, resumeCanvasVideoTask } from "../src/features/canvas/video-execution";
import type { CanvasAudioImporter, CanvasVideoImporter } from "../src/features/canvas/contracts";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";
import type { CanvasAudioGeneration } from "../src/features/canvas/audio-generation";
import type { CanvasVideoGeneration } from "../src/features/canvas/video-generation";

const videoAsset = { projectId: "project", assetId: "video-asset", name: "clip.mp4", kind: "VIDEO" as const, mimeType: "video/mp4", url: "asset:video", width: 640, height: 360, bytes: 128, createdAt: "now" };
const audioAsset = { projectId: "project", assetId: "audio-asset", name: "clip.mp3", kind: "AUDIO" as const, mimeType: "audio/mpeg", url: "asset:audio", bytes: 128, createdAt: "now" };

describe("canvas media execution", () => {
    test("persists a video task handle before waiting and imports its result", async () => {
        const order: string[] = [];
        const task = { id: "task-1", provider: "grok" as const, model: "video-model" };
        const generation: CanvasVideoGeneration = {
            create: vi.fn(async () => task),
            wait: vi.fn(async () => { order.push("wait"); return { blob: new Blob(["video"], { type: "video/mp4" }) }; }),
        };
        const importVideo: CanvasVideoImporter = vi.fn(async () => videoAsset);
        const result = await executeCanvasVideoTask({ projectId: "project", prompt: "room", settings: { model: "video-model", size: "16:9", seconds: "5", quality: "720", generateAudio: "false", watermark: "false", mode: "text" }, references: [], signal: new AbortController().signal, generation, media: {} as CanvasMediaAdapter, importVideo, name: "clip.mp4", onTaskCreated: () => order.push("created") });
        expect(order).toEqual(["created", "wait"]);
        expect(result).toBe(videoAsset);
        expect(importVideo).toHaveBeenCalledOnce();
    });

    test("resumes an existing video task without creating another task", async () => {
        const generation: CanvasVideoGeneration = {
            create: vi.fn(),
            wait: vi.fn(async () => ({ blob: new Blob(["video"], { type: "video/mp4" }) })),
        };
        const importVideo: CanvasVideoImporter = vi.fn(async () => videoAsset);
        const video = await resumeCanvasVideoTask({ projectId: "project", settings: { model: "video-model", size: "16:9", seconds: "5", quality: "720", generateAudio: "false", watermark: "false", mode: "text" }, handle: { id: "task-1", provider: "grok", model: "video-model" }, signal: new AbortController().signal, generation, media: {} as CanvasMediaAdapter, importVideo, name: "clip.mp4" });
        expect(generation.create).not.toHaveBeenCalled();
        expect(video).toBe(videoAsset);
    });

    test("shares audio generation and import for host-owned ports", async () => {
        const generation: CanvasAudioGeneration = { execute: vi.fn(async () => new Blob(["audio"], { type: "audio/mpeg" })) };
        const importAudio: CanvasAudioImporter = vi.fn(async () => audioAsset);
        const audio = await executeCanvasAudioTask({ projectId: "project", prompt: "calm", settings: { model: "audio-model", voice: "alloy", format: "mp3", speed: "1", instructions: "" }, signal: new AbortController().signal, generation, importAudio, name: "clip.mp3" });
        expect(audio).toBe(audioAsset);
        expect(generation.execute).toHaveBeenCalledOnce();
        expect(importAudio).toHaveBeenCalledOnce();
    });
});
