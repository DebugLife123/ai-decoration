import { describe, expect, test } from "vitest";
import { getCanvasNodeBounds, getCanvasSelectionBoxBounds, selectCanvasNodesInBox } from "../src/features/canvas/selection-geometry";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node = (id: string, x: number, y: number, width: number, height: number): CanvasNodeData => ({ id, type: CanvasNodeType.Image, title: id, position: { x, y }, width, height, metadata: {} });

describe("Canvas selection geometry", () => {
    test("calculates bounds for mixed-size nodes", () => {
        expect(getCanvasNodeBounds([node("a", 10, 20, 100, 50), node("b", -20, 80, 60, 40)])).toEqual({ left: -20, top: 20, right: 110, bottom: 120 });
    });

    test("returns an empty bounds sentinel for an empty selection", () => {
        expect(getCanvasNodeBounds([])).toEqual({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    });

    test("selects intersecting nodes in either drag direction and excludes edge-only contact", () => {
        const nodes = [node("inside", 100, 100, 120, 80), node("far", 2000, 2000, 100, 100)];
        const selection = { startWorldX: 240, startWorldY: 180, currentWorldX: 100, currentWorldY: 100, additive: false, initialSelectedNodeIds: [] };
        expect([...selectCanvasNodesInBox(nodes, selection)]).toEqual(["inside"]);
        expect([...selectCanvasNodesInBox([nodes[0]], { ...selection, startWorldX: 100, currentWorldX: 100 })]).toEqual([]);
    });

    test("retains the initial selection when additive selection is enabled", () => {
        const nodes = [node("inside", 100, 100, 120, 80), node("far", 2000, 2000, 100, 100)];
        const selection = { startWorldX: 100, startWorldY: 100, currentWorldX: 120, currentWorldY: 120, additive: true, initialSelectedNodeIds: ["far"] };
        expect([...selectCanvasNodesInBox(nodes, selection)]).toEqual(["far", "inside"]);
    });

    test("returns a normalized render rectangle for either drag direction", () => {
        expect(getCanvasSelectionBoxBounds({ startWorldX: 30, startWorldY: 50, currentWorldX: 10, currentWorldY: 20, additive: false, initialSelectedNodeIds: [] })).toEqual({ left: 10, top: 20, width: 20, height: 30 });
    });
});
