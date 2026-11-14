import { describe, expect, test } from "vitest";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";
import { copyCanvasSelection, duplicateCanvasNode, pasteCanvasClipboard } from "../src/features/canvas/node-clipboard";

const node = (id: string, x: number, y: number, groupId?: string): CanvasNodeData => ({ id, type: CanvasNodeType.Text, title: id, position: { x, y }, width: 100, height: 60, metadata: { content: id, ...(groupId ? { groupId } : {}) } });

describe("Canvas node clipboard", () => {
    test("duplicates one node with a new identity and offset while preserving node data", () => {
        const source = node("source", 10, 20);
        const duplicate = duplicateCanvasNode(source, "copy");

        expect(duplicate).toMatchObject({ id: "copy", title: "source Copy", position: { x: 46, y: 56 }, metadata: source.metadata });
        expect(source).toMatchObject({ id: "source", title: "source", position: { x: 10, y: 20 } });
    });

    test("copies only selected nodes and connections contained by the selection", () => {
        const nodes = [node("a", 0, 0), node("b", 120, 0), node("c", 240, 0)];
        const connections: CanvasConnection[] = [
            { id: "inside", fromNodeId: "a", toNodeId: "b" },
            { id: "outside", fromNodeId: "b", toNodeId: "c" },
        ];
        const clipboard = copyCanvasSelection(nodes, connections, new Set(["a", "b"]));

        expect(clipboard?.nodes.map((item) => item.id)).toEqual(["a", "b"]);
        expect(clipboard?.connections.map((item) => item.id)).toEqual(["inside"]);
        expect(clipboard?.nodes[0].position).not.toBe(nodes[0].position);
        expect(copyCanvasSelection(nodes, connections, new Set(["missing"]))).toBeNull();
    });

    test("pastes at the requested center with fresh IDs and remaps groups and connections", () => {
        const clipboard = {
            nodes: [node("group", 0, 0), node("member", 20, 20, "group"), node("external-member", 240, 20, "outside")],
            connections: [{ id: "edge", fromNodeId: "member", toNodeId: "external-member" }],
        };
        const result = pasteCanvasClipboard(clipboard, { x: 300, y: 200 }, (_node, index) => `new-${index}`, (_connection, index) => `new-edge-${index}`)!;

        expect(result.nodes.map((item) => item.id)).toEqual(["new-0", "new-1", "new-2"]);
        expect(result.nodes.map((item) => item.title)).toEqual(["group Copy", "member Copy", "external-member Copy"]);
        expect(result.nodes[1].metadata?.groupId).toBe("new-0");
        expect(result.nodes[2].metadata?.groupId).toBeUndefined();
        expect(result.connections).toEqual([{ id: "new-edge-0", fromNodeId: "new-1", toNodeId: "new-2" }]);
        const bounds = result.nodes.reduce((acc, item) => ({ left: Math.min(acc.left, item.position.x), top: Math.min(acc.top, item.position.y), right: Math.max(acc.right, item.position.x + item.width), bottom: Math.max(acc.bottom, item.position.y + item.height) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        expect({ x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 }).toEqual({ x: 300, y: 200 });
    });
});
