import { expect, test } from "vitest";
import { applyCanvasImageWritebackResult } from "../src/features/canvas/image-writeback-result";
import type { CanvasNodeData } from "../src/types/canvas";

const node: CanvasNodeData = {
    id: "panorama",
    type: "interior:panorama",
    title: "全景预览",
    position: { x: 20, y: 40 },
    width: 640,
    height: 320,
    metadata: { status: "loading", errorDetails: "old error", interactive: true },
};

test("writes plugin image metadata while preserving the node geometry", () => {
    const other = { ...node, id: "other" };
    const uploadedImage = { projectId: "project", assetId: "asset", name: "result.png", kind: "IMAGE" as const, mimeType: "image/png", url: "asset:result", width: 1200, height: 600, bytes: 120, createdAt: "now" };
    const [updated, unchanged] = applyCanvasImageWritebackResult([node, other], { nodeId: node.id, uploadedImage, prompt: "明亮客厅", model: "fixture" });
    expect(updated).toMatchObject({ position: node.position, width: node.width, height: node.height, metadata: { interactive: true, content: "asset:result", assetId: "asset", prompt: "明亮客厅", model: "fixture", status: "success", errorDetails: undefined } });
    expect(unchanged).toBe(other);
});
