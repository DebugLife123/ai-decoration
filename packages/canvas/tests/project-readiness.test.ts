import { describe, expect, test } from "vitest";
import { isCanvasProjectReady } from "../src/features/canvas/project-readiness";

describe("Canvas project readiness", () => {
    const requested = { projectId: "project-b", attempt: 0 };

    test("requires the completed document to match the active project", () => {
        expect(isCanvasProjectReady(true, requested, { projectId: "project-a", attempt: 0 })).toBe(false);
        expect(isCanvasProjectReady(true, requested, requested)).toBe(true);
    });

    test("ignores a previous load attempt and incomplete project", () => {
        expect(isCanvasProjectReady(true, { ...requested, attempt: 1 }, requested)).toBe(false);
        expect(isCanvasProjectReady(false, requested, requested)).toBe(false);
        expect(isCanvasProjectReady(true, requested, null)).toBe(false);
    });
});
