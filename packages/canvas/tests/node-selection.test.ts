import { describe, expect, test } from "vitest";
import { selectCanvasNode } from "../src/features/canvas/node-selection";

describe("Canvas node selection", () => {
    test("selects one node and reports its toolbar target", () => {
        const result = selectCanvasNode(new Set(), "node-a", false);

        expect([...result.nextSelected]).toEqual(["node-a"]);
        expect(result.soloId).toBe("node-a");
    });

    test("preserves an existing multi-selection when pressing a selected node", () => {
        const result = selectCanvasNode(new Set(["node-a", "node-b"]), "node-a", false);

        expect([...result.nextSelected]).toEqual(["node-a", "node-b"]);
        expect(result.soloId).toBeNull();
    });

    test("adds and toggles nodes for modifier selection", () => {
        const added = selectCanvasNode(new Set(["node-a"]), "node-b", true);
        const removed = selectCanvasNode(added.nextSelected, "node-a", true);

        expect([...added.nextSelected]).toEqual(["node-a", "node-b"]);
        expect(added.soloId).toBeNull();
        expect([...removed.nextSelected]).toEqual(["node-b"]);
        expect(removed.soloId).toBeNull();
    });
});
