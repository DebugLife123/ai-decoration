import { describe, expect, test } from "vitest";
import { createCanvasProjectAssetNode } from "../src/features/canvas/project-asset-node";

const base = { projectId: "project", assetId: "asset", name: "素材", mimeType: "image/png", url: "asset://content", createdAt: "fixture" };

describe("project asset node transform", () => {
    test("creates an image node centered on the requested point with task/version identity", () => {
        const node = createCanvasProjectAssetNode({ ...base, kind: "IMAGE", width: 800, height: 400 }, "node-image", { x: 500, y: 300 }, { width: 340, height: 120 }, { taskId: "task", versionId: "version" });
        expect(node).toMatchObject({ id: "node-image", type: "image", title: "素材", position: { x: 240, y: 170 }, width: 520, height: 260, metadata: { assetId: "asset", taskId: "task", versionId: "version", status: "success" } });
    });

    test("uses bounded video size and the audio default size", () => {
        const video = createCanvasProjectAssetNode({ ...base, kind: "VIDEO", mimeType: "video/mp4", width: 1920, height: 1080, durationMs: 1000 }, "node-video", { x: 0, y: 0 }, { width: 340, height: 120 });
        const audio = createCanvasProjectAssetNode({ ...base, kind: "AUDIO", mimeType: "audio/mpeg", durationMs: 1000 }, "node-audio", { x: 0, y: 0 }, { width: 340, height: 120 });
        expect(video).toMatchObject({ type: "video", width: 420, height: 236.25 });
        expect(audio).toMatchObject({ type: "audio", width: 340, height: 120, metadata: { naturalWidth: undefined, naturalHeight: undefined } });
    });

    test("scales small project images up to a consistent display frame without changing ratio", () => {
        const node = createCanvasProjectAssetNode({ ...base, kind: "IMAGE", width: 160, height: 80 }, "small", { x: 0, y: 0 }, { width: 340, height: 120 });
        expect(node).toMatchObject({ width: 520, height: 260, position: { x: -260, y: -130 } });
    });
});
