import { describe, expect, test } from "vitest";
import { getCanvasPopoverPosition } from "../src/lib/canvas/canvas-popover-position";

const anchor = (left: number, top: number, width = 40, height = 32) => ({ left, right: left + width, top, bottom: top + height, width });

describe("canvas settings popover position", () => {
    test("flips below when a top placement has more room below the trigger", () => {
        expect(getCanvasPopoverPosition(anchor(120, 20), "topLeft", { width: 375, height: 812 })).toEqual({
            position: "fixed",
            zIndex: 1200,
            width: 351,
            left: 12,
            top: 60,
            maxHeight: 740,
        });
    });

    test("flips above when a bottom placement has more room above the trigger", () => {
        expect(getCanvasPopoverPosition(anchor(120, 740), "bottom", { width: 375, height: 812 })).toEqual({
            position: "fixed",
            zIndex: 1200,
            width: 351,
            left: 12,
            bottom: 80,
            maxHeight: 720,
        });
    });

    test("clamps width and horizontal position to narrow viewport margins", () => {
        expect(getCanvasPopoverPosition(anchor(150, 180), "bottomRight", { width: 280, height: 600 })).toEqual({
            position: "fixed",
            zIndex: 1200,
            width: 256,
            left: 12,
            top: 220,
            maxHeight: 368,
        });
    });
});
