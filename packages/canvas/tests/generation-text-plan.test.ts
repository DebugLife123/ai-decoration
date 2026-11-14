import { describe, expect, test } from "vitest";
import { applyCanvasTextGenerationPlan, createCanvasTextGenerationPlan } from "../src/features/canvas/generation-text-plan";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const sizes = { config: { width: 220, height: 180 }, text: { width: 300, height: 200 } };
const source = (type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id: "source", type, title: "Source", position: { x: 10, y: 20 }, width: 260, height: 160, metadata });
const config = { model: "text-model", reasoningEffort: "high" as const };

describe("Canvas text generation plan", () => {
    test("creates text slots to the right of a config node", () => {
        const plan = createCanvasTextGenerationPlan({ nodeId: "source", sourceNode: source(CanvasNodeType.Config), reuseSource: false, prompt: "Brief", config, textCount: 2, sizes, createId: (() => { let n = 0; return () => `id-${++n}`; })() });
        expect(plan).toMatchObject({ rootId: "id-1", textIds: ["id-2", "id-3"], isConfigNode: true, isEmptyTextNode: false, rootNode: { position: { x: 326, y: 10 }, width: 300, height: 200, metadata: { status: "loading", model: "text-model", reasoningEffort: "high", textCount: 2, primaryTextId: "id-2", texts: [{ id: "id-2" }, { id: "id-3" }] } } });
        expect(applyCanvasTextGenerationPlan([source(CanvasNodeType.Config)], plan)).toHaveLength(2);
    });

    test("reuses an empty text node and updates a config source without adding a duplicate", () => {
        const empty = source(CanvasNodeType.Text);
        const plan = createCanvasTextGenerationPlan({ nodeId: "source", sourceNode: empty, reuseSource: true, prompt: "New text", config, textCount: 1, sizes, createId: () => "unused" });
        expect(plan).toMatchObject({ rootId: "source", isEmptyTextNode: true, rootNode: { position: empty.position, width: empty.width, height: empty.height } });
        expect(applyCanvasTextGenerationPlan([empty], plan)).toHaveLength(1);
        const configNode = source(CanvasNodeType.Config, { status: "success" });
        const configPlan = createCanvasTextGenerationPlan({ nodeId: "source", sourceNode: configNode, reuseSource: false, prompt: "New text", config, textCount: 1, sizes, createId: () => "root" });
        expect(applyCanvasTextGenerationPlan([configNode], configPlan)[0].metadata).toMatchObject({ status: "loading", errorDetails: undefined });
    });
});
