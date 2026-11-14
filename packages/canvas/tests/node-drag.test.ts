import { describe, expect, test } from "vitest";
import { createCanvasNodeDragState, finishCanvasNodeDrag, getCanvasDragNodeIds, getCanvasDragPositions, moveCanvasNodes, previewCanvasNodeDrag, resetCanvasNodeDragState, resolveCanvasNodeDragEnd, resolveCanvasNodeDragMove, resolveCanvasNodeDragPreview } from "../src/features/canvas/node-drag";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const image = (id: string, x: number, y: number, groupId?: string): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x, y },
    width: 100,
    height: 80,
    metadata: groupId ? { groupId } : {},
});

const group: CanvasNodeData = { id: "group", type: CanvasNodeType.Group, title: "组", position: { x: 0, y: 0 }, width: 240, height: 200, metadata: {} };

describe("Canvas node drag feature", () => {
    test("converts screen movement through zoom and preserves the drag threshold", () => {
        expect(resolveCanvasNodeDragMove({ x: 10, y: 10 }, { x: 14, y: 12 }, 2, false)).toEqual({ dx: 2, dy: 1, hasMoved: true });
        expect(resolveCanvasNodeDragMove({ x: 10, y: 10 }, { x: 13, y: 12 }, 2, false).hasMoved).toBe(false);
        expect(resolveCanvasNodeDragMove({ x: 10, y: 10 }, { x: 10, y: 10 }, 2, true).hasMoved).toBe(true);
    });
    test("resolves drag end movement and click identity", () => {
        const initial = [{ id: "node", x: 10, y: 20 }];
        expect(resolveCanvasNodeDragEnd({ x: 10, y: 20 }, { x: 14, y: 24 }, 2, false, initial)).toEqual({ dx: 2, dy: 2, wasClick: true, clickedNodeId: "node" });
        expect(resolveCanvasNodeDragEnd({ x: 10, y: 20 }, null, 2, true, initial)).toEqual({ dx: 0, dy: 0, wasClick: false, clickedNodeId: "node" });
        expect(resolveCanvasNodeDragEnd({ x: 0, y: 0 }, { x: 4, y: 4 }, 1, false, [...initial, { id: "other", x: 0, y: 0 }]).clickedNodeId).toBeUndefined();
    });
    test("captures selected group members into a drag state", () => {
        const state = createCanvasNodeDragState(new Set(["group"]), [group, image("child", 30, 40, "group")], { x: 12, y: 18 });
        expect(state).toMatchObject({ isDraggingNode: true, hasMoved: false, startX: 12, startY: 18 });
        expect(state.initialSelectedNodes).toEqual([{ id: "group", x: 0, y: 0 }, { id: "child", x: 30, y: 40 }]);
    });
    test("combines movement and group target preview without owning React state", () => {
        const state = createCanvasNodeDragState(new Set(["moving"]), [image("moving", 300, 300), group], { x: 100, y: 100 });
        const result = resolveCanvasNodeDragPreview([image("moving", 300, 300), group], state, { x: -460, y: -460 }, 2);
        expect(result).toMatchObject({ dx: -280, dy: -280, hasMoved: true, preview: { dropTargetGroupId: "group" } });
    });
    test("resets drag state after a completed gesture", () => {
        expect(resetCanvasNodeDragState()).toEqual({ isDraggingNode: false, hasMoved: false, startX: 0, startY: 0, initialSelectedNodes: [] });
    });
    test("includes group members and captures their starting positions", () => {
        const nodes = [group, image("child", 30, 40, "group"), image("other", 400, 400)];
        const ids = getCanvasDragNodeIds(new Set(["group"]), nodes);
        expect([...ids]).toEqual(["group", "child"]);
        expect(getCanvasDragPositions(ids, nodes)).toEqual([
            { id: "group", x: 0, y: 0 },
            { id: "child", x: 30, y: 40 },
        ]);
    });

    test("moves only captured nodes and previews a group drop target", () => {
        const nodes = [image("moving", 300, 300), group];
        const initial = getCanvasDragPositions(new Set(["moving"]), nodes);
        expect(moveCanvasNodes(nodes, initial, -280, -280)[0].position).toEqual({ x: 20, y: 20 });
        expect(previewCanvasNodeDrag(nodes, initial, -280, -280).dropTargetGroupId).toBe("group");
    });

    test("snaps a moved node into the group and records its membership", () => {
        const nodes = [image("moving", 300, 300), group];
        const initial = getCanvasDragPositions(new Set(["moving"]), nodes);
        const result = finishCanvasNodeDrag(nodes, initial, -280, -280);
        expect(result.find((node) => node.id === "moving")).toMatchObject({ position: { x: 24, y: 24 }, metadata: { groupId: "group" } });
    });

    test("updates membership when a node leaves a group without changing its geometry", () => {
        const nodes = [image("moving", 30, 40, "group"), group];
        const initial = getCanvasDragPositions(new Set(["moving"]), nodes);
        const result = finishCanvasNodeDrag(nodes, initial, 300, 300);
        expect(result.find((node) => node.id === "moving")).toMatchObject({ position: { x: 330, y: 340 }, metadata: { groupId: undefined } });
    });
});
