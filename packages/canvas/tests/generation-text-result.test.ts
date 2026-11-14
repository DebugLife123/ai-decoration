import { describe, expect, test } from "vitest";
import { applyCanvasTextDelta, applyCanvasTextNodeDelta, applyCanvasTextNodeResult, applyCanvasTextResult } from "../src/features/canvas/generation-text-result";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const root: CanvasNodeData = {
    id: "root", type: CanvasNodeType.Text, title: "Batch", position: { x: 0, y: 0 }, width: 320, height: 200,
    metadata: { content: "primary old", primaryTextId: "a", texts: [{ id: "a", status: "loading", content: "old" }, { id: "b", status: "loading", content: "" }] },
};
const other: CanvasNodeData = { id: "other", type: CanvasNodeType.Text, title: "Other", position: { x: 0, y: 0 }, width: 320, height: 200, metadata: {} };

describe("Canvas streaming text result transforms", () => {
    test("applies deltas to the matching slot and only mirrors the primary slot to node content", () => {
        const [updated, unchanged] = applyCanvasTextDelta([root, other], "root", "b", "secondary delta");
        expect(updated.metadata).toMatchObject({ content: "primary old", texts: [{ id: "a", content: "old" }, { id: "b", content: "secondary delta" }] });
        expect(unchanged).toBe(other);
        expect(applyCanvasTextDelta([root], "root", "a", "primary delta")[0].metadata).toMatchObject({ content: "primary delta" });
    });

    test("applies success or failure to one slot and mirrors only the primary result", () => {
        const [success] = applyCanvasTextResult([root], "root", { id: "b", status: "success", content: "secondary" });
        expect(success.metadata).toMatchObject({ content: "primary old", texts: [{ id: "a" }, { id: "b", status: "success", content: "secondary" }] });
        const [failure] = applyCanvasTextResult([root], "root", { id: "a", status: "error", content: "", errorDetails: "failed" });
        expect(failure.metadata).toMatchObject({ content: "", texts: [{ id: "a", status: "error", errorDetails: "failed" }, { id: "b", status: "loading" }] });
    });

    test("applies text-node retry deltas and completion without changing unrelated nodes", () => {
        const [streaming, unchanged] = applyCanvasTextNodeDelta([root, other], "root", "streaming");
        expect(streaming).toMatchObject({ type: CanvasNodeType.Text, metadata: { content: "streaming", status: "loading" } });
        expect(unchanged).toBe(other);

        const [complete] = applyCanvasTextNodeResult([root], "root", "final", "retry prompt");
        expect(complete).toMatchObject({ type: CanvasNodeType.Text, metadata: { content: "final", prompt: "retry prompt", status: "success" } });
    });
});
