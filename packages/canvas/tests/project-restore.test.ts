import { describe, expect, test, vi } from "vitest";
const mediaMocks = vi.hoisted(() => ({ restoreCanvasMedia: vi.fn() }));
vi.mock("../src/features/canvas/media", () => mediaMocks);
import { restoreCanvasProjectDocument } from "../src/features/canvas/project-restore";
import type { CanvasProjectDocument } from "../src/features/canvas/contracts";
import type { CanvasMediaAdapter, CanvasMediaSnapshot } from "../src/features/canvas/media";

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

function createMedia(restore: CanvasMediaAdapter["restore"]): CanvasMediaAdapter {
    return {
        restore,
        async readImage() { return "data:image/png;base64,AA=="; },
        async readMedia() { return new Blob(); },
        cleanup() {},
    };
}

describe("Canvas project document restore", () => {
    mediaMocks.restoreCanvasMedia.mockImplementation((adapter: CanvasMediaAdapter, projectId: string, snapshot: CanvasMediaSnapshot, signal: AbortSignal) => adapter.restore(projectId, snapshot, signal));

    test("loads by project identity then materializes only the document media fields", async () => {
        const getDocument = vi.fn(async () => document);
        const restore: CanvasMediaAdapter["restore"] = vi.fn(async (_projectId: string, snapshot: CanvasMediaSnapshot, _signal: AbortSignal) => snapshot);
        const media = createMedia(restore);

        const restored = await restoreCanvasProjectDocument(getDocument, media, "project-a", new AbortController().signal);

        expect(getDocument).toHaveBeenCalledWith("project-a", expect.any(AbortSignal));
        expect(restore).toHaveBeenCalledWith("project-a", { nodes: [], chatSessions: [] }, expect.any(AbortSignal));
        expect(restored).toMatchObject({ projectId: "project-a", viewport: document.viewport, nodes: [] });
    });

    test("does not materialize media when the project is missing", async () => {
        const restore = vi.fn();
        const restored = await restoreCanvasProjectDocument(async () => null, createMedia(restore), "missing", new AbortController().signal);

        expect(restored).toBeNull();
        expect(restore).not.toHaveBeenCalled();
    });

    test("rejects a document that resolves after its load is aborted", async () => {
        let resolveDocument!: (value: CanvasProjectDocument) => void;
        const getDocument = () => new Promise<CanvasProjectDocument>((resolve) => { resolveDocument = resolve; });
        const restore = vi.fn();
        const controller = new AbortController();
        const pending = restoreCanvasProjectDocument(getDocument, createMedia(restore), "project-a", controller.signal);
        controller.abort();
        resolveDocument(document);

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(restore).not.toHaveBeenCalled();
    });
});
