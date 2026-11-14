import { describe, expect, test } from "vitest";
import { applyCanvasVideoResult } from "../src/features/canvas/video-result";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { CanvasImportedVideo } from "../src/features/canvas/contracts";

const node: CanvasNodeData = {
    id: "video-node",
    type: CanvasNodeType.Video,
    title: "旧视频",
    position: { x: 100, y: 80 },
    width: 320,
    height: 320,
    metadata: { prompt: "旧提示词", status: "loading" },
};

const video: CanvasImportedVideo = {
    assetId: "asset-video",
    projectId: "project-1",
    name: "新视频.mp4",
    kind: "VIDEO",
    mimeType: "video/mp4",
    url: "blob:result",
    width: 1920,
    height: 1080,
    durationMs: 3000,
    bytes: 128,
    createdAt: "2026-11-07T00:00:00.000Z",
};

describe("Canvas video result", () => {
    test("fits the result inside the existing node and centers it", () => {
        expect(applyCanvasVideoResult(node, video, { prompt: "新方案", status: "success" })).toMatchObject({
            position: { x: 50, y: 121.875 },
            width: 420,
            height: 236.25,
            metadata: { assetId: "asset-video", durationMs: 3000, prompt: "新方案", status: "success" },
        });
    });

    test("preserves the current node dimensions when media dimensions are missing", () => {
        expect(applyCanvasVideoResult(node, { ...video, width: 0, height: 0 })).toMatchObject({ width: 320, height: 320, position: node.position });
    });
});
