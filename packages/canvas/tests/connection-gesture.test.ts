import { describe, expect, test } from "vitest";
import { resolveCanvasConnectionDrop, resolveCanvasConnectionHover } from "../src/features/canvas/connection-gesture";

describe("Canvas connection gesture", () => {
    test("maps hover target and canvas position for host state updates", () => {
        expect(resolveCanvasConnectionHover({ nodeId: "target", isNearNode: true }, { x: 12, y: 24 })).toEqual({ targetNodeId: "target", mouseWorld: { x: 12, y: 24 } });
        expect(resolveCanvasConnectionHover({ nodeId: null, isNearNode: false }, { x: 3, y: 4 }).targetNodeId).toBeNull();
    });
    test("connects when a valid target was hit", () => {
        expect(resolveCanvasConnectionDrop({ nodeId: "target", isNearNode: true }, { x: 1, y: 2 })).toEqual({ type: "connect", nodeId: "target" });
    });

    test("cancels when the pointer is near an invalid node", () => {
        expect(resolveCanvasConnectionDrop({ nodeId: null, isNearNode: true }, { x: 1, y: 2 })).toEqual({ type: "cancel" });
    });

    test("opens the connection create flow on empty canvas", () => {
        expect(resolveCanvasConnectionDrop({ nodeId: null, isNearNode: false }, { x: 12, y: 24 })).toEqual({ type: "create", position: { x: 12, y: 24 } });
    });
});
