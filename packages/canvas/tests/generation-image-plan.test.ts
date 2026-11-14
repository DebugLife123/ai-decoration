import { describe, expect, test } from "vitest";
import { applyCanvasImageGenerationPlan, createCanvasImageGenerationPlan } from "../src/features/canvas/generation-image-plan";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const config = { model: "image-model", size: "2:1", quality: "high", background: "transparent", count: "3" } as const;
const ids = (() => { let value = 0; return () => `id-${++value}`; })();
const sizes = { config: { width: 220, height: 180 }, image: { width: 320, height: 240 }, text: { width: 260, height: 180 } };
const source = (type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id: "source", type, title: "Source", position: { x: 10, y: 20 }, width: 240, height: 160, metadata,
});

describe("Canvas image generation plan", () => {
    test("creates a generated root and loading slots to the right of a config node", () => {
        const plan = createCanvasImageGenerationPlan({ nodeId: "source", sourceNode: source(CanvasNodeType.Config), prompt: "A room", config, count: 3, references: [], sizes, createId: ids });
        expect(plan).toMatchObject({ rootId: "id-1", imageIds: ["id-2", "id-3", "id-4"], isConfigNode: true, isEmptyImageNode: false });
        expect(plan.rootNode).toMatchObject({ type: CanvasNodeType.Image, position: { x: 10 + sizes.config.width + 96 }, metadata: { status: "loading", count: 3, model: "image-model", size: "2:1", quality: "high", background: "transparent", images: [{ id: "id-2", status: "loading" }, { id: "id-3", status: "loading" }, { id: "id-4", status: "loading" }] } });
    });

    test("reuses an empty image node and applies the source-specific start state", () => {
        const emptyImage = source(CanvasNodeType.Image, { prompt: "old", errorDetails: "old error" });
        const plan = createCanvasImageGenerationPlan({ nodeId: "source", sourceNode: emptyImage, prompt: "new", config, count: 1, references: [{ id: "ref", url: "asset://ref", dataUrl: "data:image/png;base64,", mimeType: "image/png" }], sizes, createId: ids });
        expect(plan.rootId).toBe("source");
        expect(plan.rootNode.position).toEqual(emptyImage.position);
        expect(plan.rootNode.metadata).toMatchObject({ generationType: "edit", references: ["asset://ref"], images: [{ status: "loading" }] });
        expect(applyCanvasImageGenerationPlan([emptyImage], plan, "new")).toMatchObject([{ id: "source", title: "new", metadata: { prompt: "new", status: "loading", errorDetails: undefined } }]);
    });

    test("keeps a completed image source and converts a text source into its prompt node", () => {
        const imageSource = source(CanvasNodeType.Image, { content: "asset://source" });
        const imagePlan = createCanvasImageGenerationPlan({ nodeId: "source", sourceNode: imageSource, prompt: "new", config, count: 1, references: [], sizes, createId: ids });
        expect(applyCanvasImageGenerationPlan([imageSource], imagePlan, "new")[0].metadata).toMatchObject({ content: "asset://source", status: "success" });
        const textSource = source(CanvasNodeType.Text, { content: "old" });
        const textPlan = createCanvasImageGenerationPlan({ nodeId: "source", sourceNode: textSource, prompt: "new", config, count: 1, references: [], sizes, createId: ids });
        expect(applyCanvasImageGenerationPlan([textSource], textPlan, "new")[0]).toMatchObject({ type: CanvasNodeType.Text, title: "new", metadata: { content: "new", prompt: "new", status: "success" } });
    });
});
