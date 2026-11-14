import { describe, expect, test, vi } from "vitest";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

import { createApiCanvasHostAdapters, createCanvasHttpHostAdapters } from "../src/features/canvas";
import { selectCanvasVersionId } from "../src/features/canvas/version-selection";
import { createMockCanvasAdapter } from "../src/services/api/canvas/mock-adapter";

describe("API canvas host adapters", () => {
    test("exposes the HTTP host adapter from the public canvas entry", () => {
        expect(createCanvasHttpHostAdapters).toBeTypeOf("function");
    });

    test("assembles project, version, and media boundaries from one API", async () => {
        const mock = createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,cG5n", width: 2, height: 1 } });
        const adapters = createApiCanvasHostAdapters(mock.api);
        expect(adapters.api).toBe(mock.api);

        await adapters.projects.loadProjects();
        expect(adapters.projects.getSnapshot().projects[0].projectId).toBe(mock.initialProjectId);

        const versionId = await adapters.versions.saveVersion(mock.initialProjectId, {
            title: "Draft",
            createdAt: "fixture",
            nodes: [],
            connections: [],
            backgroundMode: "lines",
            showImageInfo: false,
            viewport: { x: 0, y: 0, k: 1 },
        });
        await adapters.versions.loadVersions(mock.initialProjectId);
        expect(adapters.versions.getSnapshot(mock.initialProjectId).versions[0].versionId).toBe(versionId);

        const asset = (await mock.api.listAssets(mock.initialProjectId))[0];
        await expect(adapters.media.readMedia(mock.initialProjectId, { name: asset.name, assetId: asset.assetId }, new AbortController().signal))
            .resolves.toBeInstanceOf(Blob);
    });

    test("optionally attaches one binary uploader to the same API asset bundle", () => {
        const mock = createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,cG5n", width: 2, height: 1 } });
        const uploadBinary = vi.fn();
        const adapters = createApiCanvasHostAdapters(mock.api, { uploadBinary });
        expect(adapters.uploads?.uploadBinary).toBe(uploadBinary);
        expect(adapters.uploads?.listAssets).toBe(mock.api.listAssets);
    });

    test("Mock exposes the same persistence bundle shape as an API host", () => {
        const mock = createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,cG5n", width: 2, height: 1 } });
        expect(mock.hostAdapters).toMatchObject({
            api: mock.api,
            assets: mock.api,
            uploads: expect.objectContaining({ uploadBinary: expect.any(Function) }),
            tasks: mock.api,
            results: mock.api,
            taskExecution: expect.objectContaining({ submit: expect.any(Function), query: expect.any(Function), update: expect.any(Function), poll: expect.any(Function) }),
            projects: mock.projectHost,
            versions: mock.versionHost,
            media: mock.media,
        });
    });

    test("exposes task submission and polling through the same bundle API", async () => {
        const mock = createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,cG5n", width: 2, height: 1 } });
        expect(mock.hostAdapters.tasks).toBe(mock.api);
        expect(mock.hostAdapters.assets).toBe(mock.api);
        expect(mock.hostAdapters.results).toBe(mock.api);
        const assets = await mock.hostAdapters.assets!.listAssets(mock.initialProjectId);
        const queued = await mock.hostAdapters.taskExecution!.submit({ projectId: mock.initialProjectId, type: "GENERATE", prompt: "room", sourceAssetId: assets[0].assetId });
        expect(queued.status).toBe("QUEUED");
        expect((await mock.hostAdapters.taskExecution!.query(queued.taskId)).task.status).toBe("RUNNING");
    });

    test("keeps asset ticket upload and registration inside the asset boundary", async () => {
        const mock = createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,cG5n", width: 2, height: 1 } });
        const assets = mock.hostAdapters.assets!;
        const ticket = await assets.createUploadTicket({ projectId: mock.initialProjectId, name: "uploaded.png", mimeType: "image/png", bytes: 3 });
        await expect(assets.registerAsset({ projectId: mock.initialProjectId, uploadId: ticket.uploadId, name: "uploaded.png", mimeType: "image/png", kind: "IMAGE", width: 2, height: 2 })).rejects.toMatchObject({ code: "UPLOAD_NOT_COMPLETED" });
        await mock.uploadBinary(ticket, new File([new Uint8Array([1, 2, 3])], "uploaded.png", { type: "image/png" }));
        const storage = await assets.completeUpload({ projectId: mock.initialProjectId, uploadId: ticket.uploadId });
        expect(storage.kind).toBe("OBJECT_STORAGE");
        const asset = await assets.registerAsset({ projectId: mock.initialProjectId, uploadId: ticket.uploadId, name: "uploaded.png", mimeType: "image/png", kind: "IMAGE", width: 2, height: 2 });
        expect(asset.storageRef?.key).toBe(storage.key);
        await expect(assets.readAssetContent(mock.initialProjectId, asset.assetId)).resolves.toBeInstanceOf(Blob);
    });

    test("bundle keeps save failures isolated and honors cancellation", async () => {
        const mock = createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,cG5n", width: 2, height: 1 } });
        const adapters = createApiCanvasHostAdapters(mock.api);
        await adapters.projects.loadProjects();
        const document = await adapters.projects.getDocument(mock.initialProjectId);
        mock.failNextDocumentSave();
        await expect(adapters.projects.saveDocument(mock.initialProjectId, { ...document!, showImageInfo: true })).rejects.toMatchObject({ code: "MOCK_PROJECT_SAVE_FAILED" });
        await expect(adapters.projects.getDocument(mock.initialProjectId)).resolves.toMatchObject({ showImageInfo: false });

        const controller = new AbortController();
        controller.abort();
        await expect(adapters.media.readImage(mock.initialProjectId, { id: "sample", name: "room.png", dataUrl: "data:image/png;base64,cG5n" }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    });

    test("falls back to the first version after the current version disappears", () => {
        const versions = [{ versionId: "v2" }, { versionId: "v1" }];
        expect(selectCanvasVersionId(versions, "missing")).toBe("v2");
        expect(selectCanvasVersionId(versions, "v1")).toBe("v1");
        expect(selectCanvasVersionId([], "missing")).toBe("");
    });
});
