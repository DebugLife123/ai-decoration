import { describe, expect, test, vi } from "vitest";
const restoreMedia = vi.hoisted(() => vi.fn());
vi.mock("../src/features/canvas/media", () => ({ restoreCanvasMedia: restoreMedia }));
import { restoreCanvasVersionDocument } from "../src/features/canvas/version-restore";
import type { CanvasProjectDocument, CanvasVersionDocument } from "../src/features/canvas/contracts";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";

const current: CanvasProjectDocument = {
    projectId: "project-a",
    nodes: [],
    connections: [],
    chatSessions: [{ id: "chat-1", title: "Current chat", messages: [] }],
    activeChatId: "chat-1",
    backgroundMode: "lines",
    showImageInfo: false,
    viewport: { x: 0, y: 0, k: 1 },
    currentVersionId: null,
};

const version: CanvasVersionDocument = {
    versionId: "version-a",
    projectId: "project-a",
    title: "Saved design",
    createdAt: "2026-01-01T00:00:00.000Z",
    nodes: [],
    connections: [],
    backgroundMode: "dots",
    showImageInfo: true,
    viewport: { x: 12, y: 24, k: 2 },
};

const media = {} as CanvasMediaAdapter;

describe("Canvas version restore", () => {
    test("materializes version media and saves a document preserving current chat state", async () => {
        const nodes = [{ id: "restored-node" }] as CanvasProjectDocument["nodes"];
        restoreMedia.mockResolvedValueOnce({ nodes, chatSessions: [] });
        const saveDocument = vi.fn(async () => undefined);

        const restored = await restoreCanvasVersionDocument("project-a", current, version, media, saveDocument, new AbortController().signal);

        expect(restoreMedia).toHaveBeenCalledWith(media, "project-a", { nodes: version.nodes, chatSessions: [] }, expect.any(AbortSignal));
        expect(saveDocument).toHaveBeenCalledWith("project-a", expect.objectContaining({
            nodes,
            connections: version.connections,
            chatSessions: current.chatSessions,
            activeChatId: current.activeChatId,
            currentVersionId: version.versionId,
            viewport: version.viewport,
        }));
        expect(restored.backgroundMode).toBe("dots");
    });

    test("does not save when canceled during media restore", async () => {
        const controller = new AbortController();
        restoreMedia.mockImplementationOnce(async (_media: CanvasMediaAdapter, _projectId: string, _snapshot: unknown, signal: AbortSignal) => {
            controller.abort();
            signal.throwIfAborted();
        });
        const saveDocument = vi.fn(async () => undefined);

        await expect(restoreCanvasVersionDocument("project-a", current, version, media, saveDocument, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(saveDocument).not.toHaveBeenCalled();
    });

    test("does not publish success when canceled while the host save is pending", async () => {
        const controller = new AbortController();
        restoreMedia.mockResolvedValueOnce({ nodes: [], chatSessions: [] });
        let finishSave!: () => void;
        const saveDocument = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
        const pending = restoreCanvasVersionDocument("project-a", current, version, media, saveDocument, controller.signal);
        await vi.waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));
        controller.abort();
        finishSave();

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    });
});
