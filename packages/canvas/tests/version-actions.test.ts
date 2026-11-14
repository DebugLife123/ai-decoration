import { describe, expect, test, vi } from "vitest";
import { deleteCanvasVersionAndSelect, saveCanvasVersionSnapshot } from "../src/features/canvas/version-actions";
import type { CanvasVersionDocument } from "../src/features/canvas/contracts";
import type { CanvasVersionHost } from "../src/features/canvas/project-host";

const version = (versionId: string): CanvasVersionDocument => ({
    versionId,
    projectId: "project-a",
    title: versionId,
    createdAt: "2026-01-01T00:00:00.000Z",
    nodes: [],
    connections: [],
    backgroundMode: "lines",
    showImageInfo: false,
    viewport: { x: 0, y: 0, k: 1 },
});

describe("Canvas version actions", () => {
    test("submits a detached snapshot so later editor changes cannot mutate it", async () => {
        const nodes = [{ id: "node-a" }] as CanvasVersionDocument["nodes"];
        const saveVersion = vi.fn(async (_projectId: string, snapshot: Omit<CanvasVersionDocument, "versionId" | "projectId">) => {
            expect(snapshot.nodes).not.toBe(nodes);
            return "version-a";
        });
        const host = { saveVersion } as unknown as CanvasVersionHost;

        const saved = saveCanvasVersionSnapshot(host, "project-a", {
            title: "Design",
            createdAt: "2026-01-01T00:00:00.000Z",
            nodes,
            connections: [],
            backgroundMode: "lines",
            showImageInfo: false,
            viewport: { x: 0, y: 0, k: 1 },
        });
        nodes.push({ id: "later-change" } as never);

        await expect(saved).resolves.toBe("version-a");
        expect(saveVersion).toHaveBeenCalledOnce();
    });

    test("selects the first remaining version after deleting the current version", async () => {
        const snapshot = { versions: [version("version-b"), version("version-c")], currentVersionId: null };
        const host = {
            deleteVersion: vi.fn(async () => undefined),
            getSnapshot: vi.fn(() => snapshot),
        } as unknown as CanvasVersionHost;

        await expect(deleteCanvasVersionAndSelect(host, "project-a", "version-a")).resolves.toBe("version-b");
        expect(host.getSnapshot).toHaveBeenCalledWith("project-a");
    });

    test("keeps the current version selected after deleting a different version", async () => {
        const host = {
            deleteVersion: vi.fn(async () => undefined),
            getSnapshot: vi.fn(() => ({ versions: [version("current")], currentVersionId: "current" })),
        } as unknown as CanvasVersionHost;

        await expect(deleteCanvasVersionAndSelect(host, "project-a", "older")).resolves.toBe("current");
    });

    test("does not return a selection if deletion fails", async () => {
        const getSnapshot = vi.fn();
        const host = {
            deleteVersion: vi.fn(async () => { throw new Error("delete failed"); }),
            getSnapshot,
        } as unknown as CanvasVersionHost;

        await expect(deleteCanvasVersionAndSelect(host, "project-a", "version-a")).rejects.toThrow("delete failed");
        expect(getSnapshot).not.toHaveBeenCalled();
    });
});
