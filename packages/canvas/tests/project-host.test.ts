import { createStore } from "zustand";
import { describe, expect, test, vi } from "vitest";
import { createCanvasState } from "../src/stores/canvas/canvas-state";
import type { CanvasStore } from "../src/stores/canvas/canvas-state";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

const { createCanvasProjectHost } = await import("../src/features/canvas/project-host");
const { CanvasApiError } = await import("../src/features/canvas/contracts");

describe("CanvasProjectHost", () => {
    test("synchronizes a store hydrated before the host subscribes", () => {
        const store = createStore<CanvasStore>()(createCanvasState);
        const host = createCanvasProjectHost(store);
        const projectId = store.getState().createProject("Restored plan");
        store.setState({ hydrated: true });
        const listener = vi.fn();

        const unsubscribe = host.subscribe(listener);

        expect(host.getSnapshot()).toMatchObject({ hydrated: true, projects: [{ projectId, name: "Restored plan" }] });
        expect(listener).toHaveBeenCalledOnce();
        unsubscribe();
    });

    test("publishes stable metadata snapshots through its subscription and async commands", async () => {
        const store = createStore<CanvasStore>()(createCanvasState);
        const host = createCanvasProjectHost(store);
        const listener = vi.fn();
        const unsubscribe = host.subscribe(listener);

        const initial = host.getSnapshot();
        expect(host.getSnapshot()).toBe(initial);
        expect("createProject" in initial).toBe(false);

        const projectId = await host.createProject("Room plan");
        const updated = host.getSnapshot();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(updated).not.toBe(initial);
        expect(host.getSnapshot().projects[0]).toMatchObject({ projectId, name: "Room plan" });
        const initialDocument = await host.getDocument(projectId);
        expect(initialDocument).toMatchObject({ projectId, nodes: [], showImageInfo: false });
        await host.saveDocument(projectId, { ...initialDocument!, showImageInfo: true });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(host.getSnapshot()).toBe(updated);
        await host.renameProject(projectId, "Living room");
        expect(host.getSnapshot().projects[0].name).toBe("Living room");
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
        await host.deleteProjects([projectId]);
        expect(listener).toHaveBeenCalledTimes(2);
        expect(await host.getDocument(projectId)).toBeNull();
    });

    test("rejects mismatched or failed document saves without changing stored data", async () => {
        const store = createStore<CanvasStore>()(createCanvasState);
        const projectId = store.getState().createProject("Room plan");
        const beforeSave = vi.fn(() => { throw new CanvasApiError("MOCK_PROJECT_SAVE_FAILED", "Mock 项目保存失败"); });
        const host = createCanvasProjectHost(store, { beforeSave });
        const original = await host.getDocument(projectId);
        expect(original).not.toBeNull();
        await expect(host.saveDocument(projectId, { ...original!, projectId: "other" })).rejects.toMatchObject({ code: "PROJECT_ID_MISMATCH" });
        await expect(host.saveDocument(projectId, { ...original!, showImageInfo: true })).rejects.toMatchObject({ code: "MOCK_PROJECT_SAVE_FAILED" });
        expect(await host.getDocument(projectId)).toEqual(original);
        expect(beforeSave).toHaveBeenCalledTimes(1);
    });

    test("commits local document saves in call order when an earlier write is slow", async () => {
        const store = createStore<CanvasStore>()(createCanvasState);
        const projectId = store.getState().createProject("Room plan");
        let releaseFirst!: () => void;
        const beforeSave = vi.fn(async (_id: string, document: { showImageInfo: boolean }) => {
            if (document.showImageInfo) await new Promise<void>((resolve) => { releaseFirst = resolve; });
        });
        const host = createCanvasProjectHost(store, { beforeSave });
        const original = await host.getDocument(projectId);
        const first = host.saveDocument(projectId, { ...original!, showImageInfo: true });
        await vi.waitFor(() => expect(beforeSave).toHaveBeenCalledOnce());
        const second = host.saveDocument(projectId, { ...original!, backgroundMode: "dots" });
        await Promise.resolve();
        expect(beforeSave).toHaveBeenCalledOnce();
        releaseFirst();
        await Promise.all([first, second]);

        expect(await host.getDocument(projectId)).toMatchObject({ showImageInfo: false, backgroundMode: "dots" });
    });

    test("rejects an already-cancelled local document read before returning a snapshot", async () => {
        const store = createStore<CanvasStore>()(createCanvasState);
        const projectId = store.getState().createProject("Room plan");
        const controller = new AbortController();
        controller.abort();
        const host = createCanvasProjectHost(store);

        await expect(host.getDocument(projectId, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    });
});
