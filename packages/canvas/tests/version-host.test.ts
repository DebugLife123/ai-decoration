import { createStore } from "zustand";
import { describe, expect, test, vi } from "vitest";
import { createCanvasState } from "../src/stores/canvas/canvas-state";
import type { CanvasStore } from "../src/stores/canvas/canvas-state";
import { createCanvasVersionHost } from "../src/features/canvas/project-host";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

describe("CanvasVersionHost", () => {
    test("isolates version snapshots and notifies only when versions change", async () => {
        const store = createStore<CanvasStore>()(createCanvasState);
        const host = createCanvasVersionHost(store);
        const projectId = store.getState().createProject("Room plan");
        const otherProjectId = store.getState().createProject("Other plan");
        const listener = vi.fn();
        const unsubscribe = host.subscribe(projectId, listener);

        const initial = host.getSnapshot(projectId);
        expect(host.getSnapshot(projectId)).toBe(initial);
        store.getState().updateProject(projectId, { showImageInfo: true });
        expect(listener).not.toHaveBeenCalled();

        const versionId = await host.saveVersion(projectId, {
            title: "First version",
            createdAt: new Date().toISOString(),
            nodes: [],
            connections: [],
            backgroundMode: "lines",
            showImageInfo: true,
            viewport: { x: 0, y: 0, k: 1 },
        });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(host.getSnapshot(projectId).versions[0]).toMatchObject({ versionId, projectId, title: "First version" });
        expect(host.getSnapshot(otherProjectId).versions).toEqual([]);

        await host.deleteVersion(projectId, versionId);
        expect(listener).toHaveBeenCalledTimes(2);
        expect(host.getSnapshot(projectId).versions).toEqual([]);
        unsubscribe();
    });

    test("returns detached API-shaped version snapshots and rejects operations for missing projects", async () => {
        const store = createStore<CanvasStore>()(createCanvasState);
        const host = createCanvasVersionHost(store);
        const projectId = store.getState().createProject("Room plan");
        const versionId = await host.saveVersion(projectId, {
            title: "Snapshot", createdAt: new Date().toISOString(), nodes: [], connections: [],
            backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 },
        });
        const snapshot = host.getSnapshot(projectId).versions[0];
        expect(snapshot).toMatchObject({ versionId, projectId, title: "Snapshot" });
        expect("id" in snapshot).toBe(false);
        expect(() => snapshot.nodes.push({} as never)).toThrow();
        expect(host.getSnapshot(projectId).versions[0].nodes).toEqual([]);
        await host.deleteVersion(projectId, versionId);
        await store.getState().deleteProjects([projectId]);
        await expect(host.saveVersion(projectId, {
            title: "Missing", createdAt: new Date().toISOString(), nodes: [], connections: [],
            backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 },
        })).rejects.toThrow("项目不存在");
    });
});
