import { describe, expect, test } from "vitest";
import { createCanvasSelectionBox, resolveCanvasSelectionMove, updateCanvasSelectionBox } from "../src/features/canvas/selection-gesture";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const nodes: CanvasNodeData[] = [{ id: "inside", type: CanvasNodeType.Image, title: "inside", position: { x: 10, y: 10 }, width: 100, height: 80, metadata: {} }];

describe("Canvas selection gesture", () => {
    test("creates an additive selection box with a stable initial selection", () => {
        const selected = new Set(["a", "b"]);
        expect(createCanvasSelectionBox({ x: 12, y: 24 }, true, selected)).toEqual({
            startWorldX: 12,
            startWorldY: 24,
            currentWorldX: 12,
            currentWorldY: 24,
            additive: true,
            initialSelectedNodeIds: ["a", "b"],
        });
        selected.add("c");
        expect(createCanvasSelectionBox({ x: 0, y: 0 }, false, selected).initialSelectedNodeIds).toEqual([]);
    });

    test("updates while buttons are pressed and ends when the pointer is released", () => {
        const selection = createCanvasSelectionBox({ x: 1, y: 2 }, false, new Set());
        expect(updateCanvasSelectionBox(selection, { x: 10, y: 20 }, 1)).toMatchObject({ currentWorldX: 10, currentWorldY: 20 });
        expect(updateCanvasSelectionBox(selection, { x: 10, y: 20 }, 0)).toBeNull();
    });

    test("returns the updated selection and selected nodes as one move result", () => {
        const selection = createCanvasSelectionBox({ x: 0, y: 0 }, false, new Set());
        expect(resolveCanvasSelectionMove(nodes, selection, { x: 60, y: 60 }, 1)).toEqual({
            selection: { ...selection, currentWorldX: 60, currentWorldY: 60 },
            selectedIds: new Set(["inside"]),
        });
        expect(resolveCanvasSelectionMove(nodes, selection, { x: 60, y: 60 }, 0)).toBeNull();
    });
});
