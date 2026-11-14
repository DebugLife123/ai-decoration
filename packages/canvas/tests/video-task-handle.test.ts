import { describe, expect, test, vi } from "vitest";
vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
import { getResumableVideoTaskHandle, hasResumableVideoTask, hasVideoTaskReference } from "../src/lib/canvas/video-task-handle";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node = (metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id: "video-node",
    type: CanvasNodeType.Video,
    title: "Video",
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata,
});

describe("persisted video task handles", () => {
    test("accepts a complete remote provider handle", () => {
        const video = node({ videoTaskId: " task-1 ", videoTaskProvider: "grok", videoTaskModel: " video-model " });
        expect(getResumableVideoTaskHandle(video)).toEqual({ id: "task-1", provider: "grok", model: "video-model" });
        expect(hasResumableVideoTask(video)).toBe(true);
    });

    test.each([
        { videoTaskId: "task-1", videoTaskProvider: "openai", videoTaskModel: "" },
        { videoTaskId: "task-1", videoTaskProvider: "openai", videoTaskModel: "   " },
        { videoTaskId: "   ", videoTaskProvider: "openai", videoTaskModel: "model" },
        { videoTaskId: "", videoTaskProvider: "openai", videoTaskModel: "model" },
        { videoTaskId: "task-1", videoTaskProvider: undefined, videoTaskModel: "model" },
        { videoTaskId: "task-1", videoTaskProvider: "plugin" as never, videoTaskModel: "model" },
        { videoTaskId: "task-1", videoTaskProvider: "unknown" as never, videoTaskModel: "model" },
    ])("rejects incomplete or non-persistable metadata %#", (metadata) => {
        const video = node(metadata);
        expect(getResumableVideoTaskHandle(video)).toBeNull();
        expect(hasResumableVideoTask(video)).toBe(false);
        expect(hasVideoTaskReference(video)).toBe(Boolean(metadata.videoTaskId?.trim()));
    });

    test("does not resume a completed video even when a stale task remains", () => {
        const video = node({ content: "data:video/mp4;base64,AA==", videoTaskId: "task-1", videoTaskProvider: "openai", videoTaskModel: "model" });
        expect(hasResumableVideoTask(video)).toBe(false);
    });
});
