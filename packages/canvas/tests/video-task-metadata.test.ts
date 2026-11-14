import { describe, expect, test } from "vitest";
import { applyCanvasVideoTaskHandle, getCanvasVideoTaskMetadata } from "../src/features/canvas/video-task-metadata";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { CanvasVideoProviderHandle } from "../src/features/canvas/video-generation";

const node: CanvasNodeData = {
    id: "video-node",
    type: CanvasNodeType.Video,
    title: "视频",
    position: { x: 10, y: 20 },
    width: 320,
    height: 180,
    metadata: { prompt: "保留提示词", status: "loading" },
};

describe("video task metadata", () => {
    test("maps remote task handles to resumable metadata", () => {
        const handle: CanvasVideoProviderHandle = { id: "task-1", provider: "grok", model: "video-model" };
        expect(getCanvasVideoTaskMetadata(handle)).toEqual({ videoTaskId: "task-1", videoTaskProvider: "grok", videoTaskModel: "video-model" });
        expect(applyCanvasVideoTaskHandle(node, handle, "selected-model")).toMatchObject({
            position: node.position,
            width: node.width,
            metadata: { prompt: "保留提示词", status: "loading", videoTaskId: "task-1", videoTaskProvider: "grok", videoTaskModel: "video-model", model: "selected-model" },
        });
    });

    test("does not persist plugin task handles", () => {
        const handle: CanvasVideoProviderHandle = { id: "plugin-task", provider: "plugin", model: "plugin-model" };
        expect(getCanvasVideoTaskMetadata(handle)).toBeNull();
        expect(applyCanvasVideoTaskHandle(node, handle, "selected-model")).toBe(node);
    });
});
