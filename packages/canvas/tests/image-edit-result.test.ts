import { expect, test } from "vitest";
import { applyCanvasImageEditResult } from "../src/features/canvas/image-edit-result";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node: CanvasNodeData = {
    id: "target",
    type: CanvasNodeType.Image,
    title: "编辑结果",
    position: { x: 20, y: 40 },
    width: 320,
    height: 240,
    metadata: { status: "loading", prompt: "旧提示" },
};

test("writes an edited image asset and fits the target node without touching other nodes", () => {
    const other = { ...node, id: "other" };
    const uploadedImage = { projectId: "project", assetId: "asset", name: "result.png", kind: "IMAGE" as const, mimeType: "image/png", url: "asset:result", width: 800, height: 400, bytes: 120, createdAt: "now" };
    const [updated, unchanged] = applyCanvasImageEditResult([node, other], { nodeId: node.id, uploadedImage, defaultImageSize: { width: 320, height: 240 }, prompt: "新提示", generationMetadata: { generationType: "edit" } });
    expect(updated).toMatchObject({ width: 320, height: 160, metadata: { content: "asset:result", assetId: "asset", status: "success", prompt: "新提示", generationType: "edit" } });
    expect(unchanged).toBe(other);
});
