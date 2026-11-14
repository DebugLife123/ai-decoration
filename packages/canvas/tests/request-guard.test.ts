import { describe, expect, test } from "vitest";
import { createCanvasRequestGuard } from "../src/features/canvas/request-guard";

describe("Canvas request guard", () => {
    test("only accepts the latest request for the same project and task", () => {
        const guard = createCanvasRequestGuard();
        const first = guard.begin("project-1", "task-1");
        const second = guard.begin("project-1", "task-2");

        expect(guard.isCurrent(first, "project-1", "task-1")).toBe(false);
        expect(guard.isCurrent(second, "project-1", "task-2")).toBe(true);
        expect(guard.isCurrent(second, "project-2", "task-2")).toBe(false);
        expect(guard.isCurrent(second, "project-1", "task-1")).toBe(false);
    });

    test("invalidating a project switch rejects an in-flight result", () => {
        const guard = createCanvasRequestGuard();
        const request = guard.begin("project-1");
        guard.invalidate();

        expect(guard.isCurrent(request, "project-1")).toBe(false);
        expect(guard.isCurrent(guard.begin("project-2"), "project-2")).toBe(true);
    });
});
