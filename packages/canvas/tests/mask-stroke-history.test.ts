import { describe, expect, it } from "vitest";
import { commitCanvasMaskStroke, redoCanvasMaskStroke, resetCanvasMaskStrokeHistory, undoCanvasMaskStroke } from "../src/features/canvas/mask-stroke-history";

const stroke = { mode: "paint" as const, size: 20, points: [{ x: 1, y: 2 }] };

describe("canvas mask stroke history", () => {
    it("commits a completed stroke and clears the redo branch", () => {
        const history = { undo: [stroke], redo: [stroke] };
        expect(commitCanvasMaskStroke(history, stroke)).toEqual({ undo: [stroke, stroke], redo: [] });
        expect(commitCanvasMaskStroke(history, { ...stroke, points: [] })).toBe(history);
    });

    it("moves strokes between undo and redo in reverse order", () => {
        const first = { ...stroke, size: 10 };
        const second = { ...stroke, size: 30 };
        const history = { undo: [first, second], redo: [] };
        const undone = undoCanvasMaskStroke(history);
        expect(undone).toEqual({ undo: [first], redo: [second] });
        expect(redoCanvasMaskStroke(undone)).toEqual(history);
    });

    it("keeps an empty history unchanged and resets both branches", () => {
        const empty = resetCanvasMaskStrokeHistory();
        expect(undoCanvasMaskStroke(empty)).toBe(empty);
        expect(redoCanvasMaskStroke(empty)).toBe(empty);
        expect(resetCanvasMaskStrokeHistory()).toEqual({ undo: [], redo: [] });
    });
});
