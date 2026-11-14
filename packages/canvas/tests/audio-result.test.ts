import { expect, test } from "vitest";
import { applyCanvasAudioResult } from "../src/features/canvas/audio-result";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { CanvasImportedAudio } from "../src/features/canvas/contracts";

const node: CanvasNodeData = {
    id: "audio-node",
    type: CanvasNodeType.Audio,
    title: "旧音频",
    position: { x: 20, y: 40 },
    width: 320,
    height: 160,
    metadata: { status: "loading", prompt: "旧提示" },
};

const audio: CanvasImportedAudio = {
    projectId: "project-1",
    assetId: "asset-audio",
    name: "result.mp3",
    kind: "AUDIO",
    mimeType: "audio/mpeg",
    url: "asset:audio",
    durationMs: 2300,
    bytes: 80,
    createdAt: "now",
};

test("writes audio asset metadata without changing node geometry", () => {
    const updated = applyCanvasAudioResult(node, audio, { prompt: "新提示", audioFormat: "mp3", status: "success" });
    expect(updated).toMatchObject({ position: node.position, width: node.width, height: node.height, metadata: { content: "asset:audio", assetId: "asset-audio", durationMs: 2300, prompt: "新提示", audioFormat: "mp3", status: "success" } });
});
