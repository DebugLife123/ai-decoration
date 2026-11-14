import { expect, test } from "vitest";
import { applyCanvasImageEditFailure } from "../src/features/canvas/image-edit-failure";
import { applyCanvasImageEditAction } from "../src/features/canvas/image-edit-action";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node: CanvasNodeData = { id: "target", type: CanvasNodeType.Image, title: "结果", position: { x: 0, y: 0 }, width: 100, height: 80, metadata: { status: "loading", prompt: "提示" } };
const other: CanvasNodeData = { ...node, id: "other" };

test("marks only the failed edit target", () => {
    const [failed, unchanged] = applyCanvasImageEditFailure([node, other], { nodeId: "target", errorDetails: "模型失败" });
    expect(failed.metadata).toMatchObject({ status: "error", errorDetails: "模型失败", prompt: "提示" });
    expect(unchanged).toEqual(other);
});

test("routes successful edit actions through the shared result transform", () => {
    const uploadedImage = { projectId: "project", assetId: "asset", name: "result.png", kind: "IMAGE" as const, mimeType: "image/png", url: "asset:result", width: 800, height: 400, bytes: 120, createdAt: "now" };
    const [updated] = applyCanvasImageEditAction([node], { kind: "succeeded", result: { nodeId: node.id, uploadedImage, defaultImageSize: { width: 320, height: 240 }, prompt: "新提示", generationMetadata: { generationType: "edit" } } });
    expect(updated.metadata).toMatchObject({ status: "success", assetId: "asset", prompt: "新提示" });
});
