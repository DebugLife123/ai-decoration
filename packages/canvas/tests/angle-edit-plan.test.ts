import { expect, test } from "vitest";
import { createCanvasAngleEditPlan } from "../src/features/canvas/angle-edit-plan";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "原图", position: { x: 10, y: 20 }, width: 320, height: 180, metadata: { content: "data:image/png;base64,source", assetId: "asset-source", mimeType: "image/png", storageKey: "source-key" } };

test("builds a single-reference angle result node", () => {
    const plan = createCanvasAngleEditPlan({ source, childId: "result", title: "侧视图", prompt: "换角度", buildGenerationMetadata: () => ({ model: "image-model", generationType: "edit" }), size: { width: 256, height: 256 } });
    expect(plan).toMatchObject({ references: [{ id: "source", assetId: "asset-source", storageKey: "source-key" }], node: { id: "result", position: { x: 426, y: 20 }, width: 256, height: 256, metadata: { prompt: "换角度", status: "loading", model: "image-model", sourceNodeId: "source" } } });
});

test("rejects an angle edit without source content", () => {
    expect(createCanvasAngleEditPlan({ source: { ...source, metadata: {} }, childId: "result", title: "结果", prompt: "提示", buildGenerationMetadata: () => ({}), size: { width: 256, height: 256 } })).toBeNull();
});
