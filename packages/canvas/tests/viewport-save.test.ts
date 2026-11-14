import { afterEach, describe, expect, test, vi } from "vitest";
import { createCanvasViewportSaveScheduler, saveCanvasViewportSnapshot } from "../src/features/canvas/viewport-save";
import type { CanvasProjectDocument } from "../src/features/canvas/contracts";

const currentScope = { projectId: "project-a", projectLoadAttempt: 1 };
const document: CanvasProjectDocument = {
    projectId: "project-a",
    nodes: [],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    backgroundMode: "lines",
    showImageInfo: false,
    viewport: { x: 1, y: 2, k: 1 },
    currentVersionId: null,
};

afterEach(() => vi.useRealTimers());

describe("Canvas viewport save boundary", () => {
    test("debounces viewport writes and cancels the pending write", () => {
        vi.useFakeTimers();
        const scheduler = createCanvasViewportSaveScheduler();
        const save = vi.fn();
        scheduler.schedule(save);
        vi.advanceTimersByTime(300);
        scheduler.schedule(save);
        vi.advanceTimersByTime(499);
        expect(save).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(save).toHaveBeenCalledOnce();

        scheduler.schedule(save);
        scheduler.cancel();
        vi.advanceTimersByTime(500);
        expect(save).toHaveBeenCalledOnce();
    });

    test("writes the latest viewport only for the active project load", async () => {
        const writeDocument = vi.fn();
        const saveDocument = vi.fn().mockResolvedValue(undefined);
        let saved: CanvasProjectDocument | null = document;
        await saveCanvasViewportSnapshot({
            projectId: "project-a",
            scope: currentScope,
            isScopeCurrent: (scope) => scope.projectId === currentScope.projectId && scope.projectLoadAttempt === currentScope.projectLoadAttempt,
            readDocument: () => saved,
            readViewport: () => ({ x: 12, y: 24, k: 2 }),
            writeDocument: (next) => { saved = next; writeDocument(next); },
            saveDocument,
            onError: vi.fn(),
        });

        expect(writeDocument).toHaveBeenCalledWith({ ...document, viewport: { x: 12, y: 24, k: 2 } });
        expect(saveDocument).toHaveBeenCalledWith("project-a", { ...document, viewport: { x: 12, y: 24, k: 2 } });

        await saveCanvasViewportSnapshot({
            projectId: "project-b",
            scope: currentScope,
            isScopeCurrent: () => false,
            readDocument: () => saved,
            readViewport: () => ({ x: 0, y: 0, k: 1 }),
            writeDocument,
            saveDocument,
            onError: vi.fn(),
        });
        expect(saveDocument).toHaveBeenCalledOnce();
    });

    test("reports a save failure only while its project scope remains active", async () => {
        const error = new Error("write failed");
        const saveDocument = vi.fn().mockRejectedValue(error);
        const onError = vi.fn();
        let active = true;
        await saveCanvasViewportSnapshot({
            projectId: "project-a",
            scope: currentScope,
            isScopeCurrent: () => active,
            readDocument: () => document,
            readViewport: () => document.viewport,
            writeDocument: vi.fn(),
            saveDocument,
            onError,
        });
        expect(onError).toHaveBeenCalledWith(error);

        active = false;
        onError.mockClear();
        await saveCanvasViewportSnapshot({
            projectId: "project-a",
            scope: currentScope,
            isScopeCurrent: () => active,
            readDocument: () => document,
            readViewport: () => document.viewport,
            writeDocument: vi.fn(),
            saveDocument,
            onError,
        });
        expect(onError).not.toHaveBeenCalled();
    });
});
