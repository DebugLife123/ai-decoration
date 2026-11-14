import { expect, test } from "vitest";
import { resolveCanvasSplitWriteback } from "../src/features/canvas/split-result";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { CanvasSplitBatch } from "../src/features/canvas/split-image";

const node = (id: string): CanvasNodeData => ({ id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 100, height: 100 });
const batch = (items: CanvasSplitBatch["items"]): CanvasSplitBatch => ({ projectId: "project", source: node("source"), items });

test("returns only newly saved split nodes and keeps partial batches open", () => {
    const previous = batch([{ piece: { row: 0, column: 0, x: 0, y: 0, width: 1, height: 1, dataUrl: "a" }, node: node("saved") }]);
    const result = batch([
        { piece: { row: 0, column: 0, x: 0, y: 0, width: 1, height: 1, dataUrl: "a" }, node: node("saved") },
        { piece: { row: 0, column: 1, x: 1, y: 0, width: 1, height: 1, dataUrl: "b" }, node: node("new") },
        { piece: { row: 1, column: 0, x: 0, y: 1, width: 1, height: 1, dataUrl: "c" }, error: "failed" },
    ]);
    expect(resolveCanvasSplitWriteback(previous, result)).toEqual({ newNodes: [node("new")], complete: false });
});

test("marks a batch complete only after every item has a node", () => {
    const complete = batch([{ piece: { row: 0, column: 0, x: 0, y: 0, width: 1, height: 1, dataUrl: "a" }, node: node("a") }]);
    expect(resolveCanvasSplitWriteback(complete, complete)).toEqual({ newNodes: [], complete: true });
});
