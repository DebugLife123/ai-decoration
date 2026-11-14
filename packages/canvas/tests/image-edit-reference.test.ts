import { expect, test } from "vitest";
import { createCanvasImageReference } from "../src/features/canvas/image-edit-reference";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node: CanvasNodeData = { id: "image", type: CanvasNodeType.Image, title: "客厅", position: { x: 0, y: 0 }, width: 100, height: 80, metadata: { content: "data:image/png;base64,image", assetId: "asset", mimeType: "image/webp", storageKey: "storage" } };

test("maps an image node to a provider reference", () => {
    expect(createCanvasImageReference(node)).toEqual({ id: "image", assetId: "asset", name: "客厅.png", type: "image/webp", dataUrl: "data:image/png;base64,image", storageKey: "storage" });
});

test("returns null when the node has no content", () => {
    expect(createCanvasImageReference({ ...node, metadata: {} })).toBeNull();
});
