import { describe, expect, it } from "vitest";
import { getCanvasImageLineagePairs } from "../src/features/canvas/image-lineage";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const image = (id: string, metadata: CanvasNodeData["metadata"] = { content: `asset:${id}` }): CanvasNodeData => ({
    id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata,
});

describe("getCanvasImageLineagePairs", () => {
    it("maps edited result to its explicit source node", () => {
        const source = image("source");
        const result = image("result", { content: "asset:result", generationType: "edit", sourceNodeId: source.id });
        expect(getCanvasImageLineagePairs([source, result], [{ id: "edge", fromNodeId: source.id, toNodeId: result.id }])).toEqual([{ source, result }]);
    });

    it("uses a unique incoming image connection when older nodes have no sourceNodeId", () => {
        const source = image("source");
        const result = image("result", { content: "asset:result", generationType: "edit" });
        expect(getCanvasImageLineagePairs([source, result], [{ id: "edge", fromNodeId: source.id, toNodeId: result.id }])).toEqual([{ source, result }]);
    });

    it("does not guess when the source is ambiguous or media is missing", () => {
        const first = image("first");
        const second = image("second");
        const ambiguous = image("ambiguous", { content: "asset:result", generationType: "edit" });
        const missing = image("missing", { generationType: "edit", sourceNodeId: first.id });
        const edges = [first, second].map((source) => ({ id: source.id, fromNodeId: source.id, toNodeId: ambiguous.id }));
        expect(getCanvasImageLineagePairs([first, second, ambiguous, missing], [...edges, { id: "missing-edge", fromNodeId: first.id, toNodeId: missing.id }])).toEqual([]);
    });
});
