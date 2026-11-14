import type { CanvasTaskStatus } from "./contracts";

export type MockTaskTransition = "RUNNING" | "SUCCEEDED" | "FAILED" | "TERMINAL";

export function resolveMockTaskTransition(current: CanvasTaskStatus, next: Exclude<CanvasTaskStatus, "QUEUED">): MockTaskTransition | null {
    if (current === "SUCCEEDED" || current === "FAILED") return "TERMINAL";
    if (current === "QUEUED" && next !== "RUNNING") return null;
    return next;
}
