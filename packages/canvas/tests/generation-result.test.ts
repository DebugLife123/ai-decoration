import { describe, expect, test } from "vitest";
import { applyCanvasRetryImageResult, resolveCanvasRetryImageMetadata } from "../src/features/canvas/generation-result";
import { applyCanvasGenerationFailure, applyCanvasGenerationTargetsFailure } from "../src/features/canvas/generation-failure";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const uploadedImage = { projectId: "project", assetId: "new-asset", name: "new.png", kind: "IMAGE" as const, mimeType: "image/png", url: "asset:new", width: 800, height: 400, bytes: 100, createdAt: "now" };
const existingImage = { id: "image-a", status: "success" as const, content: "asset:old", naturalWidth: 400, naturalHeight: 200, bytes: 50, mimeType: "image/png" };
const node: CanvasNodeData = {
    id: "node",
    type: CanvasNodeType.Image,
    title: "方案图",
    position: { x: 100, y: 200 },
    width: 400,
    height: 300,
    metadata: { content: "asset:old", images: [existingImage], primaryImageId: existingImage.id, prompt: "旧提示" },
};
const retryImage = { ...existingImage, content: uploadedImage.url, assetId: uploadedImage.assetId, naturalWidth: uploadedImage.width, naturalHeight: uploadedImage.height, bytes: uploadedImage.bytes };
const defaultImageSize = { width: 340, height: 240 };

describe("Canvas generated image result transform", () => {
    test("keeps saved generation identity while updating resolved retry settings", () => {
        expect(resolveCanvasRetryImageMetadata({ generationType: "edit", model: "old-model", count: 4, references: ["asset:reference"] }, { model: "new-model", size: "16:9", quality: "high", background: "" }, true, [])).toEqual({ generationType: "edit", model: "new-model", size: "16:9", quality: "high", count: 4, references: ["asset:reference"] });
    });

    test("builds retry metadata from current references when no saved image metadata exists", () => {
        expect(resolveCanvasRetryImageMetadata(undefined, { model: "image-model", size: "1:1", quality: "auto", background: "transparent" }, true, [{ id: "ref", url: "asset:reference", dataUrl: "data:image/png;base64,", mimeType: "image/png" }])).toMatchObject({ generationType: "edit", count: 1, references: ["asset:reference"], background: "transparent" });
    });

    test("updates the primary image asset and fits it while preserving the node center", () => {
        const [updated] = applyCanvasRetryImageResult([node], { nodeId: node.id, imageId: existingImage.id, retryImage, uploadedImage, defaultImageSize, prompt: "新提示", generationMetadata: { generationType: "edit" } });
        expect(updated).toMatchObject({ position: { x: 100, y: 250 }, width: 400, height: 200, metadata: { content: "asset:new", assetId: "new-asset", primaryImageId: "image-a", prompt: "新提示", generationType: "edit" } });
        expect(updated.metadata?.images).toEqual([retryImage]);
    });

    test("preserves free-resize bounds when replacing the primary image", () => {
        const resized = { ...node, metadata: { ...node.metadata, freeResize: true } };
        const [updated] = applyCanvasRetryImageResult([resized], { nodeId: node.id, imageId: existingImage.id, retryImage, uploadedImage, defaultImageSize, prompt: "新提示", generationMetadata: {} });
        expect(updated).toMatchObject({ position: node.position, width: node.width, height: node.height });
    });

    test("updates a non-primary batch image without changing the displayed asset or geometry", () => {
        const secondary = { ...existingImage, id: "image-b" };
        const batch = { ...node, metadata: { ...node.metadata, images: [existingImage, secondary], content: "asset:old" } };
        const replacement = { ...retryImage, id: secondary.id };
        const [updated] = applyCanvasRetryImageResult([batch], { nodeId: node.id, imageId: secondary.id, retryImage: replacement, uploadedImage, defaultImageSize, prompt: "新提示", generationMetadata: {} });
        expect(updated).toMatchObject({ position: batch.position, width: batch.width, height: batch.height, metadata: { content: "asset:old", primaryImageId: existingImage.id, status: "success" } });
        expect(updated.metadata).not.toHaveProperty("assetId");
        expect(updated.metadata?.images?.[1]).toEqual(replacement);
    });

    test("leaves unrelated nodes unchanged", () => {
        expect(applyCanvasRetryImageResult([node], { nodeId: "missing", retryImage, uploadedImage, defaultImageSize, prompt: "prompt", generationMetadata: {} })[0]).toBe(node);
    });
});

describe("Canvas generation failure transform", () => {
    test("keeps an existing image successful while marking the failed batch item", () => {
        const batch = { ...node, metadata: { ...node.metadata, images: [existingImage, { ...existingImage, id: "image-b", status: "loading" as const, content: "" }] } };
        const [updated] = applyCanvasGenerationFailure([batch], { nodeId: node.id, imageId: "image-b", errorDetails: "生成失败" });
        expect(updated).toMatchObject({ metadata: { status: "success", errorDetails: undefined, images: [{ id: "image-a" }, { id: "image-b", status: "error", errorDetails: "生成失败" }] } });
    });

    test("marks an empty video failed and clears its failed task handle", () => {
        const video = { ...node, type: CanvasNodeType.Video, metadata: { videoTaskId: "task-1" } };
        const [updated] = applyCanvasGenerationFailure([video], { nodeId: video.id, errorDetails: "超时", videoTimedOut: true, videoTaskFailed: true });
        expect(updated).toMatchObject({ metadata: { status: "error", errorDetails: "超时", errorCode: "timeout", videoTaskId: undefined } });
    });

    test("keeps existing video content successful without attaching a timeout code", () => {
        const video = { ...node, type: CanvasNodeType.Video, metadata: { content: "asset:video", videoTaskId: "task-1" } };
        const [updated] = applyCanvasGenerationFailure([video], { nodeId: video.id, errorDetails: "超时", videoTimedOut: true });
        expect(updated).toMatchObject({ metadata: { content: "asset:video", status: "success", errorDetails: undefined } });
        expect(updated.metadata).not.toHaveProperty("errorCode");
    });

    test("marks generated targets together while optionally preserving the source node", () => {
        const source = { ...node, id: "source", metadata: { content: "old" } };
        const child = { ...node, id: "child", metadata: {} };
        const [kept, failed] = applyCanvasGenerationTargetsFailure([source, child], { nodeIds: [source.id, child.id], skipNodeId: source.id, errorDetails: "生成失败" });
        expect(kept).toBe(source);
        expect(failed).toMatchObject({ metadata: { status: "error", errorDetails: "生成失败" } });
    });
});
