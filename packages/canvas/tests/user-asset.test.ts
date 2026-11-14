import { expect, test } from "vitest";
import { createCanvasUserAsset } from "../src/features/canvas/user-asset";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const titles = { text: "Text", image: "Image", video: "Video" };
const node = (type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id: `${type}-1`, type, title: type, position: { x: 0, y: 0 }, width: 120, height: 80, metadata,
});

test("text user asset trims empty space and retains its source node and prompt", () => {
    expect(createCanvasUserAsset(node(CanvasNodeType.Text, { content: "  room notes  ", prompt: "Notes" }), titles)).toEqual({ kind: "text", title: "Notes", content: "room notes", nodeId: "text-1", prompt: "Notes" });
});

test("image user asset preserves stored media identity and natural dimensions", () => {
    expect(createCanvasUserAsset(node(CanvasNodeType.Image, { content: "blob-url", storageKey: "image:1", naturalWidth: 800, naturalHeight: 600, prompt: "Bright living room" }), titles)).toMatchObject({ kind: "image", title: "Bright living room", url: "blob-url", storageKey: "image:1", width: 800, height: 600, mimeType: "image/png", nodeId: "image-1" });
});

test("video user asset applies defaults and empty nodes are rejected", () => {
    expect(createCanvasUserAsset(node(CanvasNodeType.Video, { content: "video-url" }), titles)).toMatchObject({ kind: "video", title: "Video", url: "video-url", bytes: 0, mimeType: "video/mp4", nodeId: "video-1" });
    expect(createCanvasUserAsset(node(CanvasNodeType.Image), titles)).toBeNull();
});
