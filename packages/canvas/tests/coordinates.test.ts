import { describe, expect, test } from "vitest";
import { screenPointToCanvas } from "../src/features/canvas/coordinates";

describe("Canvas coordinates", () => {
    test("converts client coordinates using container offset and viewport scale", () => {
        expect(screenPointToCanvas({ x: 260, y: 190 }, { left: 100, top: 50 }, { x: 20, y: 10, k: 2 })).toEqual({ x: 70, y: 65 });
    });

    test("uses the origin when the canvas has no mounted container", () => {
        expect(screenPointToCanvas({ x: 40, y: 30 }, null, { x: 10, y: 5, k: 0.5 })).toEqual({ x: 60, y: 50 });
    });
});
