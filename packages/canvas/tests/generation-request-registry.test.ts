import { describe, expect, test } from "vitest";
import { createCanvasGenerationRequestRegistry } from "../src/features/canvas/generation-request-registry";

describe("Canvas generation request registry", () => {
    test("replaces and aborts a previous request for the same target", () => {
        const registry = createCanvasGenerationRequestRegistry();
        const first = registry.start("target", "origin");
        const second = registry.start("target", "origin");

        expect(first.signal.aborted).toBe(true);
        expect(second.signal.aborted).toBe(false);
        expect(registry.has("target")).toBe(true);
    });

    test("only finishes the request that still owns the target", () => {
        const registry = createCanvasGenerationRequestRegistry();
        const first = registry.start("target", "origin");
        const second = registry.start("target", "origin");

        registry.finish("target", first);
        expect(registry.has("target")).toBe(true);
        registry.finish("target", second);
        expect(registry.has("target")).toBe(false);
    });

    test("stops every child request sharing a running node and returns affected nodes", () => {
        const registry = createCanvasGenerationRequestRegistry();
        const first = registry.start("child-a", "origin", "origin");
        const second = registry.start("child-b", "origin", "origin");
        registry.start("other", "other", "other");

        expect(registry.stopByRunningId("origin")).toEqual(new Set(["child-a", "child-b", "origin"]));
        expect(first.signal.aborted).toBe(true);
        expect(second.signal.aborted).toBe(true);
        expect(registry.has("child-a")).toBe(false);
        expect(registry.has("other")).toBe(true);
    });

    test("aborts all requests during teardown", () => {
        const registry = createCanvasGenerationRequestRegistry();
        const controller = registry.start("target", "origin");
        registry.abortAll();

        expect(controller.signal.aborted).toBe(true);
        expect(registry.has("target")).toBe(false);
    });
});
