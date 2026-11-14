import { describe, expect, test } from "vitest";
import { getCanvasFitViewport, getCanvasNodeFocusViewport, getCanvasZoomViewport } from "../src/features/canvas/viewport-commands";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node = (id: string, x: number, y: number, width: number, height: number) => ({
    id,
    type: CanvasNodeType.Image,
    position: { x, y },
    width,
    height,
} as CanvasNodeData);

describe("Canvas viewport commands", () => {
    test("centers an empty canvas and fits all node bounds within the existing margins", () => {
        expect(getCanvasFitViewport([], 1000, 800)).toEqual({ x: 500, y: 400, k: 1 });
        expect(getCanvasFitViewport([node("a", 0, 0, 400, 200), node("b", 500, 300, 500, 500)], 1000, 800)).toEqual({ x: 100, y: 80, k: 0.8 });
    });

    test("centers a focused node and limits focus zoom to the current range", () => {
        expect(getCanvasNodeFocusViewport(node("a", 100, 50, 200, 100), 1000, 800)).toEqual({ x: 300, y: 300, k: 1 });
        expect(getCanvasNodeFocusViewport(node("large", 0, 0, 4000, 2000), 1000, 800).k).toBe(0.15);
    });

    test("zooms around the canvas center and clamps the requested scale", () => {
        expect(getCanvasZoomViewport({ x: 100, y: 200, k: 1 }, 2, 1000, 800)).toEqual({ x: -300, y: 0, k: 2 });
        expect(getCanvasZoomViewport({ x: 100, y: 200, k: 1 }, 100, 1000, 800).k).toBe(5);
        expect(getCanvasZoomViewport({ x: 100, y: 200, k: 1 }, 0, 1000, 800).k).toBe(0.05);
    });
});
