import { describe, expect, test } from "vitest";
import { resizeCanvasNode, toggleCanvasNodeFreeResize } from "../src/features/canvas/node-resize";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const imageNode = (overrides: Partial<CanvasNodeData> = {}) => ({
    id: "image",
    type: CanvasNodeType.Image,
    position: { x: 10, y: 20 },
    width: 200,
    height: 100,
    metadata: { naturalWidth: 400, naturalHeight: 200 },
    ...overrides,
} as CanvasNodeData);

describe("Canvas node resize transforms", () => {
    test("updates dimensions and optional position without changing other nodes", () => {
        const image = imageNode();
        const text = { ...imageNode(), id: "text", type: CanvasNodeType.Text } as CanvasNodeData;
        expect(resizeCanvasNode([image, text], "image", 300, 150, { x: 40, y: 50 })).toEqual([
            { ...image, width: 300, height: 150, position: { x: 40, y: 50 } }, text,
        ]);
        expect(resizeCanvasNode([image], "image", 300, 150)[0].position).toEqual(image.position);
    });

    test("enables free resize without changing the image's current bounds", () => {
        const image = imageNode();
        expect(toggleCanvasNodeFreeResize([image], "image")[0]).toEqual({ ...image, metadata: { ...image.metadata, freeResize: true } });
    });

    test("restores image aspect ratio and vertical center when free resize is disabled", () => {
        const image = imageNode({ width: 300, height: 240, metadata: { naturalWidth: 400, naturalHeight: 200, freeResize: true } });
        expect(toggleCanvasNodeFreeResize([image], "image")[0]).toEqual({
            ...image,
            height: 150,
            position: { x: 10, y: 65 },
            metadata: { ...image.metadata, freeResize: false },
        });
    });

    test("toggles non-image freeResize metadata without image geometry rules", () => {
        const text = imageNode({ type: CanvasNodeType.Text, metadata: {} });
        expect(toggleCanvasNodeFreeResize([text], "image")[0]).toEqual({ ...text, metadata: { freeResize: true } });
    });
});
