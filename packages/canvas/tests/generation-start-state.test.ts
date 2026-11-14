import { expect, test } from "vitest";
import { applyCanvasGenerationStart } from "../src/features/canvas/generation-start-state";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node: CanvasNodeData = {
    id: "image",
    type: CanvasNodeType.Image,
    title: "结果",
    position: { x: 10, y: 20 },
    width: 320,
    height: 240,
    metadata: {
        status: "error",
        errorDetails: "旧错误",
        errorCode: "PROVIDER_FAILED",
        images: [
            { id: "primary", status: "success", content: "asset:primary", naturalWidth: 320, naturalHeight: 240, bytes: 10, mimeType: "image/png" },
            { id: "secondary", status: "error", content: "asset:secondary", errorDetails: "旧错误", naturalWidth: 320, naturalHeight: 240, bytes: 10, mimeType: "image/png" },
        ],
    },
};

test("starts a slot retry without changing geometry or unrelated image slots", () => {
    const [updated, other] = applyCanvasGenerationStart([node, { ...node, id: "other" }], { nodeId: node.id, imageId: "secondary" });
    expect(updated).toMatchObject({ id: "image", position: node.position, width: 320, height: 240, metadata: { status: "loading", errorDetails: undefined, errorCode: undefined } });
    expect(updated.metadata?.images).toMatchObject([{ id: "primary", status: "success" }, { id: "secondary", status: "loading", errorDetails: undefined }]);
    expect(other).toEqual({ ...node, id: "other" });
});

test("starts a whole-node retry when no image slot is selected", () => {
    const [updated] = applyCanvasGenerationStart([node], { nodeId: node.id });
    expect(updated.metadata?.status).toBe("loading");
    expect(updated.metadata?.images).toMatchObject([{ id: "primary", status: "success" }, { id: "secondary", status: "error" }]);
});

test("sets a generation prompt but does not write it to config nodes", () => {
    const [updated, config] = applyCanvasGenerationStart([
        { ...node, id: "generated" },
        { ...node, id: "config", type: CanvasNodeType.Config, metadata: { ...node.metadata, prompt: "配置中的提示词" } },
    ], { nodeId: "generated", prompt: "新提示" });
    expect(updated.metadata).toMatchObject({ status: "loading", prompt: "新提示" });
    expect(config.metadata?.prompt).toBe("配置中的提示词");
});
