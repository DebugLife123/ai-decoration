import { describe, expect, test } from "vitest";
import { commitCanvasHistory, createCanvasHistoryStack, moveCanvasHistory } from "../src/features/canvas/history-stack";

const snapshot = (id: number) => ({
    nodes: [{ id: String(id) }] as never[],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    backgroundMode: "lines" as const,
    showImageInfo: false,
});

describe("Canvas history stack", () => {
    test("commits snapshots, clears redo history and keeps the newest 50 entries", () => {
        const initial = { ...createCanvasHistoryStack(), future: [snapshot(-1)] };
        const stack = Array.from({ length: 51 }, (_, index) => snapshot(index)).reduce(commitCanvasHistory, initial);

        expect(stack.past).toHaveLength(50);
        expect(stack.past[0]).toEqual(snapshot(1));
        expect(stack.past[49]).toEqual(snapshot(50));
        expect(stack.future).toEqual([]);
    });

    test("moves the current snapshot between past and future for undo and redo", () => {
        const first = snapshot(1);
        const second = snapshot(2);
        const undo = moveCanvasHistory({ past: [first], future: [] }, second, "undo");

        expect(undo?.snapshot).toBe(first);
        expect(undo?.stack).toEqual({ past: [], future: [second] });
        const redo = moveCanvasHistory(undo!.stack, first, "redo");
        expect(redo?.snapshot).toBe(second);
        expect(redo?.stack).toEqual({ past: [first], future: [] });
    });

    test("does not transition without a current snapshot or available history", () => {
        const stack = createCanvasHistoryStack();
        expect(moveCanvasHistory(stack, null, "undo")).toBeNull();
        expect(moveCanvasHistory(stack, snapshot(0), "redo")).toBeNull();
    });
});
