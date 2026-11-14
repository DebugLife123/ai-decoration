import { describe, expect, test } from "vitest";
import { findCanvasConnectionDropTarget, getCanvasConnectionTargetAnchor, getVisibleCanvasNodes } from "../src/features/canvas/viewport-geometry";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const nodes: CanvasNodeData[] = [
    { id: "inside", type: CanvasNodeType.Image, title: "内", position: { x: 100, y: 100 }, width: 120, height: 80, metadata: {} },
    { id: "far", type: CanvasNodeType.Image, title: "外", position: { x: 2000, y: 2000 }, width: 100, height: 100, metadata: {} },
    { id: "group", type: CanvasNodeType.Group, title: "组", position: { x: 90, y: 90 }, width: 180, height: 140, metadata: {} },
];

describe("Canvas viewport geometry", () => {
    test("calculates connection anchors from the active handle side", () => {
        expect(getCanvasConnectionTargetAnchor(nodes[0], { nodeId: "inside", handleType: "source" })).toEqual({ x: 100, y: 140 });
        expect(getCanvasConnectionTargetAnchor(nodes[0], { nodeId: "inside", handleType: "target" })).toEqual({ x: 220, y: 140 });
    });

    test("filters nodes using the viewport and world padding", () => {
        expect(getVisibleCanvasNodes(nodes, { x: 0, y: 0, k: 1 }, { width: 320, height: 240 }).map((node) => node.id)).toEqual(["inside", "group"]);
        expect(getVisibleCanvasNodes(nodes, { x: -1900, y: -1900, k: 1 }, { width: 320, height: 240 }).map((node) => node.id)).toEqual(["far"]);
    });

    test("prefers a valid node under the pointer and reports nearby invalid nodes", () => {
        const current = { nodeId: "source", handleType: "source" as const };
        const source = { ...nodes[0], id: "source", position: { x: 0, y: 0 } };
        const target = { ...nodes[0], id: "target" };
        expect(findCanvasConnectionDropTarget({ x: 120, y: 140 }, 1, current, [source, target])).toEqual({ nodeId: "target", isNearNode: true });
        expect(findCanvasConnectionDropTarget({ x: 100, y: 100 }, 1, current, [source])).toEqual({ nodeId: null, isNearNode: true });
        expect(findCanvasConnectionDropTarget({ x: 500, y: 500 }, 1, current, [source, target])).toEqual({ nodeId: null, isNearNode: false });
    });

    test("does not allow group nodes as connection targets", () => {
        expect(findCanvasConnectionDropTarget({ x: 120, y: 140 }, 1, { nodeId: "source", handleType: "source" }, [{ ...nodes[2], id: "target-group" }])).toEqual({ nodeId: null, isNearNode: true });
    });
});
