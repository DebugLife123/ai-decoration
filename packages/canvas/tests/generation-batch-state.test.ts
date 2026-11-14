import { describe, expect, test } from "vitest";
import { summarizeCanvasGenerationBatch } from "../src/features/canvas/generation-batch-state";

describe("Canvas generation batch state", () => {
    test("reports partial success and keeps the first failure", () => {
        expect(summarizeCanvasGenerationBatch([
            { status: "failed", errorDetails: "first failure" },
            { status: "succeeded" },
            { status: "failed", errorDetails: "later failure" },
        ])).toEqual({ hasSuccess: true, hasFailure: true, firstError: "first failure" });
    });

    test("does not treat canceled attempts as failures", () => {
        expect(summarizeCanvasGenerationBatch([{ status: "canceled" }])).toEqual({ hasSuccess: false, hasFailure: false, firstError: undefined });
    });

    test("reports all failed attempts without a success", () => {
        expect(summarizeCanvasGenerationBatch([{ status: "failed", errorDetails: "failed" }])).toEqual({ hasSuccess: false, hasFailure: true, firstError: "failed" });
    });
});
