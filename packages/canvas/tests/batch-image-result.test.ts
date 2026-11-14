import { describe, expect, test } from "vitest";
import { applyCanvasBatchImageAttemptResult, applyCanvasBatchImageResult, applyCanvasBatchImageSummary } from "../src/features/canvas/batch-image-result";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const image = { id: "image-a", status: "success" as const, content: "asset:new", naturalWidth: 800, naturalHeight: 400, bytes: 100, mimeType: "image/png", assetId: "asset-a", storageKey: "images/a" };
const node: CanvasNodeData = {
    id: "node",
    type: CanvasNodeType.Image,
    title: "批量结果",
    position: { x: 100, y: 200 },
    width: 340,
    height: 240,
    metadata: { images: [{ ...image, status: "loading" as const, content: "" }], prompt: "prompt" },
};

describe("Canvas batch image result transform", () => {
    test("writes the first successful image to the node and preserves its center", () => {
        const [updated] = applyCanvasBatchImageResult([node], { rootNodeId: node.id, image, defaultImageSize: { width: 340, height: 240 } });
        expect(updated).toMatchObject({ position: { x: 100, y: 235 }, width: 340, height: 170, metadata: { content: "asset:new", assetId: "asset-a", primaryImageId: "image-a" } });
        expect(updated.metadata?.images).toEqual([image]);
    });

    test("updates a later batch image without replacing the displayed primary asset", () => {
        const primary = { ...image, id: "image-primary", content: "asset:primary" };
        const batch = { ...node, metadata: { ...node.metadata, content: primary.content, primaryImageId: primary.id, images: [primary, { ...image, id: "image-b", content: "" }] } };
        const [updated] = applyCanvasBatchImageResult([batch], { rootNodeId: node.id, image: { ...image, id: "image-b" }, defaultImageSize: { width: 340, height: 240 } });
        expect(updated).toMatchObject({ position: batch.position, width: batch.width, height: batch.height, metadata: { content: "asset:primary", primaryImageId: primary.id } });
        expect(updated.metadata?.images?.[1]).toMatchObject({ id: "image-b", content: "asset:new" });
    });

    test("leaves unrelated nodes unchanged", () => {
        expect(applyCanvasBatchImageResult([node], { rootNodeId: "missing", image, defaultImageSize: { width: 340, height: 240 } })[0]).toBe(node);
    });

    test("maps per-image failures and config success without owning batch summary", () => {
        const failedNode = { ...node, metadata: { ...node.metadata, images: [{ ...image, status: "loading" as const, content: "" }] } };
        const failed = applyCanvasBatchImageAttemptResult([failedNode], {
            rootNodeId: node.id,
            imageId: image.id,
            defaultImageSize: { width: 340, height: 240 },
            attempt: { status: "failed", errorDetails: "quota" },
        });
        expect(failed[0].metadata?.images?.[0]).toMatchObject({ status: "error", errorDetails: "quota" });

        const config = { ...node, id: "config", metadata: { status: "loading" as const } };
        const success = applyCanvasBatchImageAttemptResult([config, node], {
            rootNodeId: node.id,
            imageId: image.id,
            configNodeId: config.id,
            defaultImageSize: { width: 340, height: 240 },
            attempt: { status: "succeeded", image },
        });
        expect(success.find((item) => item.id === config.id)?.metadata?.status).toBe("success");
    });

    test("keeps canceled item state unchanged", () => {
        const result = applyCanvasBatchImageAttemptResult([node], {
            rootNodeId: node.id,
            imageId: image.id,
            defaultImageSize: { width: 340, height: 240 },
            attempt: { status: "canceled" },
        });
        expect(result[0]).toBe(node);
    });

    test("applies the final batch status to the config and result root", () => {
        const config = { ...node, id: "config", metadata: { status: "loading" as const } };
        const root = { ...node, id: "root", metadata: { status: "loading" as const } };
        const updated = applyCanvasBatchImageSummary([config, root], {
            sourceNodeId: config.id,
            rootNodeId: root.id,
            configNodeId: config.id,
            hasSuccess: false,
            failureMessage: "生成失败",
            allFailedMessage: "全部失败",
        });
        expect(updated[0]).toMatchObject({ metadata: { status: "error", errorDetails: "生成失败" } });
        expect(updated[1]).toMatchObject({ metadata: { status: "error", errorDetails: "全部失败" } });
    });
});
