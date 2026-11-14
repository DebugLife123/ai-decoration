import { describe, expect, test } from "vitest";
import { applyGroupSelection, applyUngroupSelection, canGroupSelectedNodes, findGroupDropTarget, getGroupWrapRect } from "../src/features/canvas/group-actions";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

const image = (id: string, x: number, y: number, groupId?: string): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x, y },
    width: 100,
    height: 80,
    metadata: groupId ? { groupId } : {},
});

const group = (id: string, x = 0, y = 0): CanvasNodeData => ({ id, type: CanvasNodeType.Group, title: id, position: { x, y }, width: 280, height: 220, metadata: {} });

describe("Canvas group actions", () => {
    test("wraps selected nodes and removes flattened group connections", () => {
        const nodes = [image("a", 20, 40), image("b", 180, 100), group("old")];
        const connections: CanvasConnection[] = [{ id: "old-link", fromNodeId: "old", toNodeId: "a" }, { id: "link", fromNodeId: "a", toNodeId: "b" }];
        const rect = getGroupWrapRect([nodes[0], nodes[1]]);
        const result = applyGroupSelection(new Set(["a", "b", "old"]), nodes, connections, { ...group("next"), position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height });
        expect(result?.selectedIds).toEqual(["next"]);
        expect(result?.nodes.filter((node) => node.metadata?.groupId === "next").map((node) => node.id)).toEqual(["a", "b"]);
        expect(result?.nodes.some((node) => node.id === "old")).toBe(false);
        expect(result?.connections).toEqual([{ id: "link", fromNodeId: "a", toNodeId: "b" }]);
    });

    test("ungroups members, removes the group and keeps unrelated connections", () => {
        const nodes = [group("box"), image("child", 30, 40, "box"), image("other", 400, 40)];
        const connections: CanvasConnection[] = [{ id: "group-link", fromNodeId: "box", toNodeId: "child" }, { id: "asset-link", fromNodeId: "child", toNodeId: "other" }];
        const result = applyUngroupSelection(new Set(["box"]), nodes, connections);
        expect(result?.nodes.find((node) => node.id === "child")?.metadata?.groupId).toBeUndefined();
        expect(result?.nodes.some((node) => node.id === "box")).toBe(false);
        expect(result?.connections).toEqual([{ id: "asset-link", fromNodeId: "child", toNodeId: "other" }]);
        expect(result?.selectedIds).toEqual(["child"]);
    });

    test("rejects single-node grouping and finds only valid drop targets", () => {
        const nodes = [image("moving", 20, 20), group("box", 0, 0), group("other", 0, 0)];
        expect(canGroupSelectedNodes(new Set(["moving"]), nodes)).toBe(false);
        expect(findGroupDropTarget(new Set(["moving"]), nodes)?.id).toBe("other");
        expect(findGroupDropTarget(new Set(["box"]), nodes)).toBeNull();
    });
});
