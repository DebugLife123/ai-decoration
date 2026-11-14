import { describe, expect, test, vi } from "vitest";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
const { createMockCanvasAdapter } = await import("../src/services/api/canvas/mock-adapter");
const { createApiCanvasVersionHost } = await import("../src/features/canvas/project-host");
const { selectCanvasVersionId } = await import("../src/features/canvas/version-selection");

const setup = () => createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,fixture", width: 960, height: 640 } });

describe("API version host", () => {
    test("loads full snapshots in parallel and publishes changes", async () => {
        const adapter = setup();
        const projectId = adapter.initialProjectId;
        const saved = await adapter.api.saveProjectVersion(projectId, { title: "Draft", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } });
        const host = createApiCanvasVersionHost(adapter.api);
        const listener = vi.fn();
        host.subscribe(projectId, listener);
        await host.loadVersions(projectId);
        expect(host.getSnapshot(projectId).versions).toEqual([saved]);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    test("saves and deletes immutable snapshots without crossing project ids", async () => {
        const adapter = setup();
        const projectId = adapter.initialProjectId;
        const host = createApiCanvasVersionHost(adapter.api);
        const versionId = await host.saveVersion(projectId, { title: "Draft", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } });
        expect(host.getSnapshot(projectId).currentVersionId).toBe(versionId);
        await host.deleteVersion(projectId, versionId);
        expect(host.getSnapshot(projectId).versions).toEqual([]);
        await expect(host.deleteVersion("missing", versionId)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    });

    test("keeps the published version on delete failure and clears the current id after a successful delete", async () => {
        const adapter = setup();
        const projectId = adapter.initialProjectId;
        const firstId = await adapter.api.saveProjectVersion(projectId, { title: "First", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } }).then((version) => version.versionId);
        const secondId = await adapter.api.saveProjectVersion(projectId, { title: "Second", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } }).then((version) => version.versionId);
        const deleteProjectVersion = vi.fn().mockRejectedValueOnce(new Error("version service unavailable")).mockImplementation((id: string, versionId: string) => adapter.api.deleteProjectVersion(id, versionId));
        const host = createApiCanvasVersionHost({ ...adapter.api, deleteProjectVersion });
        await host.loadVersions(projectId);

        await expect(host.deleteVersion(projectId, secondId)).rejects.toThrow("version service unavailable");
        expect(host.getSnapshot(projectId)).toMatchObject({ currentVersionId: secondId, versions: [{ versionId: secondId }, { versionId: firstId }] });

        await host.deleteVersion(projectId, secondId);
        const snapshot = host.getSnapshot(projectId);
        expect(snapshot).toMatchObject({ currentVersionId: null, versions: [{ versionId: firstId }] });
        expect(selectCanvasVersionId(snapshot.versions, snapshot.currentVersionId)).toBe(firstId);

        await host.loadVersions(projectId);
        expect(host.getSnapshot(projectId)).toMatchObject({ currentVersionId: null, versions: [{ versionId: firstId }] });
    });

    test("keeps an empty snapshot stable and ignores a load that finishes after a save", async () => {
        const adapter = setup();
        const projectId = adapter.initialProjectId;
        let resolveList!: (value: Awaited<ReturnType<typeof adapter.api.listVersions>>) => void;
        const listVersions = vi.fn(() => new Promise<Awaited<ReturnType<typeof adapter.api.listVersions>>>((resolve) => { resolveList = resolve; }));
        const host = createApiCanvasVersionHost({ ...adapter.api, listVersions });
        const before = host.getSnapshot(projectId);
        expect(host.getSnapshot(projectId)).toBe(before);
        const loading = host.loadVersions(projectId);
        const versionId = await host.saveVersion(projectId, { title: "Saved", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } });
        resolveList([{ versionId, projectId, sourceAssetId: null, resultAssetId: null, createdAt: "fixture", name: "Saved" }]);
        await loading;
        expect(host.getSnapshot(projectId).versions.map((version) => version.versionId)).toEqual([versionId]);
    });

    test("keeps loads isolated by project and surfaces a failed refresh without publishing partial data", async () => {
        const adapter = setup();
        const projectId = adapter.initialProjectId;
        const otherProjectId = (await adapter.api.createProject("Other")).projectId;
        const listVersions = vi.fn((id: string) => id === projectId
            ? Promise.reject(new Error("version service unavailable"))
            : adapter.api.listVersions(id));
        const host = createApiCanvasVersionHost({ ...adapter.api, listVersions });
        await expect(host.loadVersions(projectId)).rejects.toThrow("version service unavailable");
        expect(host.getSnapshot(projectId).versions).toEqual([]);
        await expect(host.loadVersions(otherProjectId)).resolves.toBeUndefined();
        expect(host.getSnapshot(otherProjectId).versions).toEqual([]);
        expect(listVersions).toHaveBeenNthCalledWith(1, projectId, undefined);
        expect(listVersions).toHaveBeenNthCalledWith(2, otherProjectId, undefined);
    });

    test("ignores a stale version load after a newer save", async () => {
        const adapter = setup();
        const projectId = adapter.initialProjectId;
        let resolveList!: (value: Awaited<ReturnType<typeof adapter.api.listVersions>>) => void;
        const listVersions = vi.fn(() => new Promise<Awaited<ReturnType<typeof adapter.api.listVersions>>>((resolve) => { resolveList = resolve; }));
        const host = createApiCanvasVersionHost({ ...adapter.api, listVersions });
        const loading = host.loadVersions(projectId);
        const versionId = await host.saveVersion(projectId, { title: "Newer", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } });
        resolveList([{ versionId, projectId, sourceAssetId: null, resultAssetId: null, createdAt: "fixture", name: "Newer" }]);
        await loading;
        expect(host.getSnapshot(projectId).versions.map((version) => version.versionId)).toEqual([versionId]);
    });

    test("passes cancellation signals through version summary and snapshot reads", async () => {
        const adapter = setup();
        const projectId = adapter.initialProjectId;
        const listVersions = vi.fn((id: string, signal?: AbortSignal) => adapter.api.listVersions(id, signal));
        const getProjectDocument = vi.fn((id: string, signal?: AbortSignal) => adapter.api.getProjectDocument(id, signal));
        const getProjectVersion = vi.fn((id: string, versionId: string, signal?: AbortSignal) => adapter.api.getProjectVersion(id, versionId, signal));
        const saved = await adapter.api.saveProjectVersion(projectId, { title: "Signal", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } });
        const host = createApiCanvasVersionHost({ ...adapter.api, listVersions, getProjectDocument, getProjectVersion });
        const signal = new AbortController().signal;

        await host.loadVersions(projectId, signal);

        expect(listVersions).toHaveBeenCalledWith(projectId, signal);
        expect(getProjectDocument).toHaveBeenCalledWith(projectId, signal);
        expect(getProjectVersion).toHaveBeenCalledWith(projectId, saved.versionId, signal);
    });

    test("rejects snapshots whose version ID differs from the summary without publishing partial data", async () => {
        const adapter = setup();
        const projectId = adapter.initialProjectId;
        const saved = await adapter.api.saveProjectVersion(projectId, { title: "Expected", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } });
        const getProjectVersion = vi.fn(async (id: string, versionId: string, signal?: AbortSignal) => ({ ...await adapter.api.getProjectVersion(id, versionId, signal), versionId: "different-version" }));
        const host = createApiCanvasVersionHost({ ...adapter.api, getProjectVersion });

        await expect(host.loadVersions(projectId)).rejects.toMatchObject({ code: "VERSION_ID_MISMATCH" });
        expect(host.getSnapshot(projectId)).toMatchObject({ versions: [], currentVersionId: null });
        expect(getProjectVersion).toHaveBeenCalledWith(projectId, saved.versionId, undefined);
    });
});
