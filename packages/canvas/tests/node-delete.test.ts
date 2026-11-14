import { describe, expect, test } from "vitest";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";
import { removeCanvasNodes } from "../src/features/canvas/node-delete";

const node = (id: string, groupId?: string): CanvasNodeData => ({ id, type: CanvasNodeType.Text, title: id, position: { x: 0, y: 0 }, width: 100, height: 60, metadata: { groupId, content: id } });

describe("Canvas node deletion", () => {
    test("removes incident connections and releases members of a deleted group", () => {
        const connections: CanvasConnection[] = [{ id: "a", fromNodeId: "group", toNodeId: "other" }, { id: "b", fromNodeId: "member", toNodeId: "other" }, { id: "c", fromNodeId: "other", toNodeId: "keep" }];
        const result = removeCanvasNodes([node("group"), node("member", "group"), node("other"), node("keep")], connections, new Set(["group"]));

        expect(result.nodes.find((item) => item.id === "group")).toBeUndefined();
        expect(result.nodes.find((item) => item.id === "member")?.metadata?.groupId).toBeUndefined();
        expect(result.connections.map((item) => item.id)).toEqual(["b", "c"]);
    });

    test("returns the same collections for an empty deletion", () => {
        const nodes = [node("keep")];
        const connections: CanvasConnection[] = [];
        expect(removeCanvasNodes(nodes, connections, new Set())).toEqual({ nodes, connections });
    });
});
