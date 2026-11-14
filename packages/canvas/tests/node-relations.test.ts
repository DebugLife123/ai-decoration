import { describe, expect, test, vi } from "vitest";
vi.hoisted(() => Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } }));
import { buildCanvasConnectedNodesByTarget, countCanvasGroupChildren, getCanvasReferenceConnectedNodeIds, getCanvasRelatedHighlight } from "../src/features/canvas/node-relations";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

const node = (id: string, type = CanvasNodeType.Image, groupId?: string) => ({
    id,
    type,
    position: { x: 0, y: 0 },
    metadata: { content: `data:image/png;base64,${id}`, ...(groupId ? { groupId } : {}) },
} as CanvasNodeData);
const nodes = [node("group", CanvasNodeType.Group), node("member", CanvasNodeType.Image, "group"), node("source"), node("target")];
const connections: CanvasConnection[] = [{ id: "edge", fromNodeId: "source", toNodeId: "target" }];

describe("Canvas node relations", () => {
    test("counts group members and indexes sources by connection target", () => {
        expect(countCanvasGroupChildren(nodes).get("group")).toBe(1);
        expect(buildCanvasConnectedNodesByTarget(nodes, connections).get("target")).toEqual([nodes[2]]);
    });

    test("includes a group's members in the related highlight", () => {
        const result = getCanvasRelatedHighlight("group", nodes, connections);
        expect(result.nodeIds).toEqual(new Set(["group", "member"]));
        expect(result.connectionIds).toEqual(new Set());
    });

    test("highlights directly connected nodes and edges, but no unrelated nodes", () => {
        const result = getCanvasRelatedHighlight("target", nodes, connections);
        expect(result.nodeIds).toEqual(new Set(["target", "source"]));
        expect(result.connectionIds).toEqual(new Set(["edge"]));
    });

    test("includes connected group and group resource members for reference selection", () => {
        const groupedConnection = [{ id: "group-edge", fromNodeId: "group", toNodeId: "target" }];
        const index = buildCanvasConnectedNodesByTarget(nodes, groupedConnection);
        expect(getCanvasReferenceConnectedNodeIds("target", index, nodes)).toEqual(new Set(["target", "group", "member"]));
        expect(getCanvasReferenceConnectedNodeIds(null, index, nodes)).toEqual(new Set());
    });
});
