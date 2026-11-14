import { describe, expect, test, vi } from "vitest";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
const { createMockCanvasAdapter } = await import("../src/services/api/canvas/mock-adapter");
const { createApiCanvasProjectHost } = await import("../src/features/canvas/project-host");

const setup = () => createMockCanvasAdapter({ projectName: "客厅方案", sampleAsset: { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,fixture", width: 960, height: 640 } });

describe("API project host", () => {
    test("loads project metadata, reads/saves documents, and notifies subscribers", async () => {
        const adapter = setup();
        const host = createApiCanvasProjectHost(adapter.api);
        const listener = vi.fn();
        const unsubscribe = host.subscribe(listener);
        expect(host.getSnapshot()).toEqual({ hydrated: false, projects: [] });
        await host.loadProjects();
        expect(host.getSnapshot().projects).toHaveLength(1);
        const document = await host.getDocument(adapter.initialProjectId);
        await host.saveDocument(adapter.initialProjectId, { ...document!, showImageInfo: true });
        expect((await adapter.api.getProjectDocument(adapter.initialProjectId)).showImageInfo).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    test("creates, renames, deletes projects, and rejects unknown or mismatched documents", async () => {
        const adapter = setup();
        const host = createApiCanvasProjectHost(adapter.api);
        await host.loadProjects();
        const projectId = await host.createProject("新方案");
        expect(host.getSnapshot().projects.some((project) => project.projectId === projectId)).toBe(true);
        await host.renameProject(projectId, "新方案（已改名）");
        expect(host.getSnapshot().projects.find((project) => project.projectId === projectId)?.name).toBe("新方案（已改名）");
        await host.deleteProjects([projectId]);
        expect(host.getSnapshot().projects.some((project) => project.projectId === projectId)).toBe(false);
        await expect(host.getDocument(projectId)).resolves.toBeNull();
        await expect(host.saveDocument("missing", { projectId: "missing", nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 }, currentVersionId: null })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    });

    test("passes cancellation signals through project list and document reads", async () => {
        const adapter = setup();
        const signal = new AbortController().signal;
        const listProjects = vi.fn((requestSignal?: AbortSignal) => adapter.api.listProjects(requestSignal));
        const getProjectDocument = vi.fn((projectId: string, requestSignal?: AbortSignal) => adapter.api.getProjectDocument(projectId, requestSignal));
        const host = createApiCanvasProjectHost({ ...adapter.api, listProjects, getProjectDocument });

        await host.loadProjects(signal);
        await host.getDocument(adapter.initialProjectId, signal);

        expect(listProjects).toHaveBeenCalledWith(signal);
        expect(getProjectDocument).toHaveBeenCalledWith(adapter.initialProjectId, signal);
    });

    test("serializes API document writes for one project", async () => {
        const adapter = setup();
        let releaseFirst!: () => void;
        const saveProjectDocument = vi.fn(async (projectId: string, document: Parameters<typeof adapter.api.saveProjectDocument>[1]) => {
            if (document.showImageInfo) await new Promise<void>((resolve) => { releaseFirst = resolve; });
            return adapter.api.saveProjectDocument(projectId, document);
        });
        const host = createApiCanvasProjectHost({ ...adapter.api, saveProjectDocument });
        await host.loadProjects();
        const original = await host.getDocument(adapter.initialProjectId);
        const first = host.saveDocument(adapter.initialProjectId, { ...original!, showImageInfo: true });
        await vi.waitFor(() => expect(saveProjectDocument).toHaveBeenCalledOnce());
        const second = host.saveDocument(adapter.initialProjectId, { ...original!, backgroundMode: "dots" });
        await Promise.resolve();
        expect(saveProjectDocument).toHaveBeenCalledOnce();
        releaseFirst();
        await Promise.all([first, second]);

        expect((await adapter.api.getProjectDocument(adapter.initialProjectId))).toMatchObject({ showImageInfo: false, backgroundMode: "dots" });
    });

    test("does not publish a project list after cancellation during the request", async () => {
        const adapter = setup();
        let resolveProjects!: (projects: Awaited<ReturnType<typeof adapter.api.listProjects>>) => void;
        const listProjects = vi.fn(() => new Promise<Awaited<ReturnType<typeof adapter.api.listProjects>>>((resolve) => { resolveProjects = resolve; }));
        const host = createApiCanvasProjectHost({ ...adapter.api, listProjects });
        const controller = new AbortController();
        const loading = host.loadProjects(controller.signal);

        controller.abort();
        resolveProjects(await adapter.api.listProjects());

        await expect(loading).rejects.toMatchObject({ name: "AbortError" });
        expect(host.getSnapshot()).toEqual({ hydrated: false, projects: [] });
    });
});
