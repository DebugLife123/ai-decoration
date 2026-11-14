import { describe, expect, test } from "vitest";
import { createCanvasBatchImageCopy, deleteCanvasBatchImage, setCanvasBatchPrimary } from "../src/features/canvas/batch-image-actions";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const imageNode: CanvasNodeData = {
    id: "batch",
    type: CanvasNodeType.Image,
    title: "方案图",
    position: { x: 100, y: 200 },
    width: 400,
    height: 300,
    metadata: {
        content: "data:image/png;base64,old",
        taskId: "old-task",
        versionId: "old-version",
        prompt: "自然木色",
        images: [{ id: "image-1", status: "success", content: "data:image/png;base64,first", assetId: "asset-1", storageKey: "image-1", naturalWidth: 800, naturalHeight: 400, bytes: 12, mimeType: "image/png" }],
    },
};

describe("Canvas batch image actions", () => {
    test("selects an image as primary and clears task/version identity", () => {
        const result = setCanvasBatchPrimary(imageNode, "image-1");

        expect(result).toMatchObject({
            position: { x: 100, y: 250 },
            width: 400,
            height: 200,
            metadata: { content: "data:image/png;base64,first", assetId: "asset-1", primaryImageId: "image-1", taskId: undefined, versionId: undefined },
        });
    });

    test("preserves free-resize dimensions and leaves missing images unchanged", () => {
        const resized = { ...imageNode, metadata: { ...imageNode.metadata, freeResize: true } };
        expect(setCanvasBatchPrimary(resized, "image-1")).toMatchObject({ width: 400, height: 300, position: imageNode.position });
        expect(setCanvasBatchPrimary(imageNode, "missing")).toBe(imageNode);
    });

    test("retains text primary selection behavior", () => {
        const node: CanvasNodeData = { ...imageNode, type: CanvasNodeType.Text, metadata: { texts: [{ id: "text-1", status: "success", content: "描述" }] } };
        expect(setCanvasBatchPrimary(node, "text-1").metadata).toMatchObject({ content: "描述", primaryTextId: "text-1" });
        expect(setCanvasBatchPrimary(node, "missing")).toBe(node);
    });

    test("creates an independent image node without inheriting task or version ids", () => {
        const copy = createCanvasBatchImageCopy(imageNode, "image-1", "copy-1");

        expect(copy).toMatchObject({
            id: "copy-1",
            type: CanvasNodeType.Image,
            position: { x: 996, y: 250 },
            width: 400,
            height: 200,
            metadata: { content: "data:image/png;base64,first", assetId: "asset-1", status: "success", prompt: "自然木色" },
        });
        expect(copy?.metadata).not.toHaveProperty("taskId");
        expect(copy?.metadata).not.toHaveProperty("versionId");
        expect(createCanvasBatchImageCopy(imageNode, "missing", "copy-2")).toBeNull();
    });

    test("deletes a batch image and selects the first remaining image when the primary is removed", () => {
        const node = { ...imageNode, metadata: { ...imageNode.metadata, primaryImageId: "image-1", images: [...imageNode.metadata.images!, { id: "image-2", status: "success" as const, content: "asset://two", naturalWidth: 400, naturalHeight: 400, bytes: 5, mimeType: "image/png" }] } };
        const [updated, unchanged] = deleteCanvasBatchImage([node, { ...node, id: "other" }], "batch", "image-1");
        expect(updated.metadata).toMatchObject({ count: 1, primaryImageId: "image-2", images: [{ id: "image-2" }] });
        expect(unchanged.id).toBe("other");
    });
});
