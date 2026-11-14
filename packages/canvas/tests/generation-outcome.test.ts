import { describe, expect, test } from "vitest";
import { resolveCanvasGenerationOutcome } from "../src/features/canvas/generation-outcome";
import { resolveCanvasGenerationFailure } from "../src/features/canvas/generation-failure";

const isCanceled = (error: unknown) => error === "cancelled";

describe("Canvas generation outcome", () => {
    test("classifies an aborted signal as canceled", () => {
        const controller = new AbortController();
        controller.abort();
        expect(resolveCanvasGenerationOutcome(new Error("late"), controller.signal, "fallback", isCanceled)).toEqual({ kind: "canceled" });
    });

    test("classifies the host cancellation error as canceled", () => {
        expect(resolveCanvasGenerationOutcome("cancelled", undefined, "fallback", isCanceled)).toEqual({ kind: "canceled" });
    });

    test("keeps Error messages and uses a fallback for unknown errors", () => {
        expect(resolveCanvasGenerationOutcome(new Error("provider failed"), undefined, "fallback", isCanceled)).toEqual({ kind: "failed", message: "provider failed" });
        expect(resolveCanvasGenerationOutcome({ reason: "unknown" }, undefined, "fallback", isCanceled)).toEqual({ kind: "failed", message: "fallback" });
    });
});

test("generation failure outcome carries video task flags without changing cancellation", () => {
    const timeout = Object.assign(new Error("timed out"), { name: "VideoTaskTimeout" });
    expect(resolveCanvasGenerationFailure(timeout, undefined, "fallback", () => false)).toEqual({ kind: "failed", message: "timed out", videoTaskFailed: false, videoTimedOut: true });
    const failed = Object.assign(new Error("failed"), { name: "VideoTaskFailed" });
    expect(resolveCanvasGenerationFailure(failed, undefined, "fallback", () => false)).toEqual({ kind: "failed", message: "failed", videoTaskFailed: true, videoTimedOut: false });
    const controller = new AbortController();
    controller.abort();
    expect(resolveCanvasGenerationFailure(timeout, controller.signal, "fallback", () => false)).toEqual({ kind: "canceled" });
});
