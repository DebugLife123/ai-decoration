import { describe, expect, test } from "vitest";
import { createCanvasAutosaveDocument, createCanvasProjectSaveQueue, isCanvasProjectSaveScopeCurrent } from "../src/features/canvas/project-save";
import type { CanvasProjectDocument } from "../src/features/canvas/contracts";

const document: Omit<CanvasProjectDocument, "currentVersionId"> = {
    projectId: "project-a",
    nodes: [],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    backgroundMode: "lines",
    showImageInfo: false,
    viewport: { x: 4, y: 8, k: 1 },
};

describe("Canvas project save boundary", () => {
    test("preserves a host version when only chat/document state changes", () => {
        expect(createCanvasAutosaveDocument(document, {
            hostVersionId: null,
            canvasChanged: false,
            previousVersionId: "version-a",
        }).currentVersionId).toBe("version-a");
    });

    test("clears a stale version after canvas content changes and prefers a host version", () => {
        expect(createCanvasAutosaveDocument(document, {
            hostVersionId: null,
            canvasChanged: true,
            previousVersionId: "version-a",
        }).currentVersionId).toBeNull();
        expect(createCanvasAutosaveDocument(document, {
            hostVersionId: "version-host",
            canvasChanged: true,
            previousVersionId: "version-a",
        }).currentVersionId).toBe("version-host");
    });

    test("rejects callbacks from a previous project or load attempt", () => {
        const current = { projectId: "project-a", projectLoadAttempt: 2 };
        expect(isCanvasProjectSaveScopeCurrent(current, current)).toBe(true);
        expect(isCanvasProjectSaveScopeCurrent({ ...current, projectId: "project-b" }, current)).toBe(false);
        expect(isCanvasProjectSaveScopeCurrent({ ...current, projectLoadAttempt: 1 }, current)).toBe(false);
    });

    test("serializes writes per project while allowing other projects through", async () => {
        const saveInOrder = createCanvasProjectSaveQueue();
        let releaseFirst!: () => void;
        const first = saveInOrder("project-a", () => new Promise<void>((resolve) => { releaseFirst = resolve; }));
        const writes: string[] = [];
        const second = saveInOrder("project-a", () => { writes.push("second"); });
        await saveInOrder("project-b", () => { writes.push("other-project"); });

        expect(writes).toEqual(["other-project"]);
        releaseFirst();
        await Promise.all([first, second]);
        expect(writes).toEqual(["other-project", "second"]);
    });

    test("continues a project queue after a failed write", async () => {
        const saveInOrder = createCanvasProjectSaveQueue();
        const writes: string[] = [];
        const failed = saveInOrder("project-a", async () => { throw new Error("write failed"); });
        const next = saveInOrder("project-a", () => { writes.push("saved"); });

        await expect(failed).rejects.toThrow("write failed");
        await next;
        expect(writes).toEqual(["saved"]);
    });
});
