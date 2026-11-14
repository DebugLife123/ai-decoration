import { describe, expect, test } from "vitest";

import { resolveMockTaskTransition } from "../src/features/canvas/mock-task-state";
import { getCanvasTaskStateViolation } from "../src/features/canvas/contracts";

describe("Mock task state", () => {
    test("requires RUNNING before a queued task can finish", () => {
        expect(resolveMockTaskTransition("QUEUED", "SUCCEEDED")).toBeNull();
        expect(resolveMockTaskTransition("QUEUED", "FAILED")).toBeNull();
        expect(resolveMockTaskTransition("QUEUED", "RUNNING")).toBe("RUNNING");
    });

    test("keeps terminal tasks immutable", () => {
        expect(resolveMockTaskTransition("SUCCEEDED", "FAILED")).toBe("TERMINAL");
        expect(resolveMockTaskTransition("FAILED", "SUCCEEDED")).toBe("TERMINAL");
    });

    test("allows running tasks to complete once", () => {
        expect(resolveMockTaskTransition("RUNNING", "SUCCEEDED")).toBe("SUCCEEDED");
        expect(resolveMockTaskTransition("RUNNING", "FAILED")).toBe("FAILED");
    });

    test("shares the OpenAPI task payload invariants across adapters", () => {
        const base = { resultAssetId: null, versionId: null, error: null };
        expect(getCanvasTaskStateViolation({ ...base, status: "QUEUED" })).toBeUndefined();
        expect(getCanvasTaskStateViolation({ ...base, status: "RUNNING" })).toBeUndefined();
        expect(getCanvasTaskStateViolation({ ...base, status: "SUCCEEDED" })).toContain("requires resultAssetId");
        expect(getCanvasTaskStateViolation({ status: "SUCCEEDED", resultAssetId: "asset-1", versionId: "version-1", error: null })).toBeUndefined();
        expect(getCanvasTaskStateViolation({ status: "FAILED", resultAssetId: null, versionId: null, error: { code: "FAILED", message: "failed" } })).toBeUndefined();
        expect(getCanvasTaskStateViolation({ status: "FAILED", resultAssetId: null, versionId: null, error: null })).toContain("requires error");
        expect(getCanvasTaskStateViolation({ status: "RUNNING", resultAssetId: "asset-1", versionId: null, error: null })).toContain("Non-terminal");
    });
});
