import { expect, test } from "vitest";
import { createCanvasMaskEditPlan } from "../src/features/canvas/mask-edit-plan";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "原图", position: { x: 10, y: 20 }, width: 320, height: 180, metadata: { content: "data:image/png;base64,source", assetId: "asset-source", mimeType: "image/png", storageKey: "source-key" } };
const mask: CanvasNodeData = { id: "mask", type: CanvasNodeType.Image, title: "蒙版", position: { x: 10, y: 296 }, width: 320, height: 180, metadata: { content: "data:image/png;base64,mask", assetId: "asset-mask", mimeType: "image/png", storageKey: "mask-key" } };

test("builds edit references and a loading result node", () => {
    const plan = createCanvasMaskEditPlan({ source, mask, childId: "result", title: "编辑结果", prompt: "编辑提示", buildGenerationMetadata: () => ({ model: "image-model", generationType: "edit" }), generate: true });
    expect(plan).toMatchObject({ references: [{ id: "source", assetId: "asset-source" }, { id: "mask", assetId: "asset-mask" }], node: { id: "result", position: { x: 426, y: 20 }, width: 320, height: 180, metadata: { prompt: "编辑提示", status: "loading", model: "image-model", sourceNodeId: "source" } } });
});

test("does not mark a preview-only mask edit as loading", () => {
    const plan = createCanvasMaskEditPlan({ source, mask, childId: "result", title: "预览结果", prompt: "预览", buildGenerationMetadata: () => ({ model: "image-model" }), generate: false });
    expect(plan?.node.metadata).toEqual({ prompt: "预览" });
});

test("rejects incomplete image references", () => {
    expect(createCanvasMaskEditPlan({ source: { ...source, metadata: {} }, mask, childId: "result", title: "结果", prompt: "提示", buildGenerationMetadata: () => ({}), generate: true })).toBeNull();
});
