import type { CanvasHistorySnapshot } from "./project-restore-state";

export type CanvasHistoryStack = { past: CanvasHistorySnapshot[]; future: CanvasHistorySnapshot[] };
export type CanvasHistoryDirection = "undo" | "redo";
export type CanvasHistoryTransition = { stack: CanvasHistoryStack; snapshot: CanvasHistorySnapshot } | null;

export function createCanvasHistoryStack(): CanvasHistoryStack {
    return { past: [], future: [] };
}

export function commitCanvasHistory(stack: CanvasHistoryStack, snapshot: CanvasHistorySnapshot): CanvasHistoryStack {
    return { past: [...stack.past.slice(-49), snapshot], future: [] };
}

export function moveCanvasHistory(stack: CanvasHistoryStack, current: CanvasHistorySnapshot | null, direction: CanvasHistoryDirection): CanvasHistoryTransition {
    if (!current) return null;
    const source = direction === "undo" ? stack.past : stack.future;
    const snapshot = source[source.length - 1];
    if (!snapshot) return null;

    return {
        snapshot,
        stack: direction === "undo"
            ? { past: stack.past.slice(0, -1), future: [...stack.future, current] }
            : { past: [...stack.past, current], future: stack.future.slice(0, -1) },
    };
}
