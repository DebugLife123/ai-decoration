import { describe, expect, test } from "vitest";
import { applyCanvasTextBatchSummary, summarizeCanvasTextBatch } from "../src/features/canvas/generation-text-batch";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const root: CanvasNodeData = {
    id: "root",
    type: CanvasNodeType.Text,
    title: "回答",
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata: { primaryTextId: "text-b", content: "streamed" },
};
const config: CanvasNodeData = {
    id: "config",
    type: CanvasNodeType.Config,
    title: "配置",
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata: { status: "loading" },
};

describe("Canvas text batch result", () => {
    test("preserves configured primary selection and excludes canceled results", () => {
        const summary = summarizeCanvasTextBatch([
            { id: "text-a", status: "success", content: "A" },
            null,
            { id: "text-b", status: "success", content: "B" },
        ]);
        const nodes = applyCanvasTextBatchSummary([root, config], { rootNodeId: "root", configNodeId: "config", summary, partialFailureMessage: "partial", generationFailureMessage: "failed" });
        expect(nodes[0].metadata).toMatchObject({ content: "B", primaryTextId: "text-b", status: "success", texts: summary.allTexts });
        expect(nodes[1].metadata).toMatchObject({ status: "success", errorDetails: undefined });
    });

    test("marks a partial batch failed while retaining the successful primary", () => {
        const summary = summarizeCanvasTextBatch([
            { id: "text-a", status: "success", content: "A" },
            { id: "text-b", status: "error", content: "", errorDetails: "provider error" },
        ]);
        const [updated] = applyCanvasTextBatchSummary([root], { rootNodeId: "root", summary, partialFailureMessage: "partial", generationFailureMessage: "failed" });
        expect(updated.metadata).toMatchObject({ content: "A", primaryTextId: "text-a", status: "success", errorDetails: "partial" });
    });

    test("marks the result and config as failed when every attempt failed or was canceled", () => {
        const summary = summarizeCanvasTextBatch([{ id: "text-a", status: "error", content: "", errorDetails: "provider error" }, null]);
        const nodes = applyCanvasTextBatchSummary([root, config], { rootNodeId: "root", configNodeId: "config", summary, partialFailureMessage: "partial", generationFailureMessage: "failed" });
        expect(nodes[0].metadata).toMatchObject({ content: "", status: "error", errorDetails: "partial" });
        expect(nodes[1].metadata).toMatchObject({ status: "error", errorDetails: "failed" });
    });
});
