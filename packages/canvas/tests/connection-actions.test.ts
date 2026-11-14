import { describe, expect, test } from "vitest";
import { disconnectCanvasReference, hasCanvasConnection, normalizeCanvasConnection, removeCanvasConnection } from "../src/features/canvas/connection-actions";
import { CanvasNodeType } from "../src/types/canvas";

const connections = [
    { id: "reference", fromNodeId: "asset", toNodeId: "config" },
    { id: "other", fromNodeId: "text", toNodeId: "config" },
    { id: "reverse", fromNodeId: "config", toNodeId: "asset" },
] as const;

describe("canvas connection actions", () => {
    const nodes = [
        { id: "image", type: CanvasNodeType.Image },
        { id: "config", type: CanvasNodeType.Config },
        { id: "group", type: CanvasNodeType.Group },
    ].map((node) => ({ ...node, title: node.id, position: { x: 0, y: 0 }, width: 100, height: 80, metadata: {} }));

    test("normalizes valid endpoints and rejects self, group and config-to-config links", () => {
        expect(normalizeCanvasConnection("image", "config", nodes, "source")).toEqual({ fromNodeId: "image", toNodeId: "config" });
        expect(normalizeCanvasConnection("config", "image", nodes, "target")).toEqual({ fromNodeId: "image", toNodeId: "config" });
        expect(normalizeCanvasConnection("image", "group", nodes, "source")).toBeNull();
        expect(normalizeCanvasConnection("config", "config", nodes, "source")).toBeNull();
        expect(normalizeCanvasConnection("image", "image", nodes, "source")).toBeNull();
    });

    test("checks exact directed endpoints without treating the reverse edge as a duplicate", () => {
        expect(hasCanvasConnection([...connections], "asset", "config")).toBe(true);
        expect(hasCanvasConnection([...connections], "config", "asset")).toBe(true);
        expect(hasCanvasConnection([...connections], "config", "text")).toBe(false);
    });

    test("removes one connection by id and preserves unrelated references", () => {
        expect(removeCanvasConnection([...connections], "reference")).toEqual([connections[1], connections[2]]);
    });

    test("disconnects only the requested directed reference", () => {
        expect(disconnectCanvasReference([...connections], "asset", "config")).toEqual([connections[1], connections[2]]);
        expect(disconnectCanvasReference([...connections], "missing", "config")).toEqual(connections);
    });
});
