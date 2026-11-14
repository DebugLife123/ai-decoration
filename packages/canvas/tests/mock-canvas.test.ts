import { describe, expect, vi, test } from "vitest";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
const { createMockCanvasAdapter } = await import("../src/services/api/canvas/mock-adapter");
const { CanvasApiError } = await import("../src/features/canvas/contracts");

const sampleAsset = { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,fixture", width: 960, height: 640 };
const setup = () => createMockCanvasAdapter({ sampleAsset });

describe("Canvas Mock contract", () => {
    test("one-shot document save failure leaves the document unchanged and allows the next save", async () => {
        const { projectHost, initialProjectId: projectId, failNextDocumentSave } = setup();
        const original = await projectHost.getDocument(projectId);
        failNextDocumentSave();
        await expect(projectHost.saveDocument(projectId, { ...original!, showImageInfo: true })).rejects.toMatchObject({ code: "MOCK_PROJECT_SAVE_FAILED" });
        expect(await projectHost.getDocument(projectId)).toEqual(original);
        await projectHost.saveDocument(projectId, { ...original!, showImageInfo: true });
        expect((await projectHost.getDocument(projectId))?.showImageInfo).toBe(true);
    });

    test("exposes document and version commands through the same Mock API contract", async () => {
        const { api, versionHost, initialProjectId: projectId } = setup();
        const original = await api.getProjectDocument(projectId);
        expect(original).not.toBeNull();
        await api.saveProjectDocument(projectId, { ...original!, showImageInfo: true });
        expect((await api.getProjectDocument(projectId))?.showImageInfo).toBe(true);
        const saved = await api.saveProjectVersion(projectId, { title: "Manual version", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: true, viewport: { x: 0, y: 0, k: 1 } });
        expect(saved).toMatchObject({ projectId, title: "Manual version" });
        await api.deleteProjectVersion(projectId, saved.versionId);
        expect(versionHost.getSnapshot(projectId).versions).toEqual([]);
    });

    test("models object storage upload as ticket -> complete -> asset registration", async () => {
        const { api, initialProjectId: projectId } = setup();
        const ticket = await api.createUploadTicket({ projectId, name: "new-room.png", mimeType: "image/png", bytes: 12 });
        expect(ticket).toMatchObject({ projectId, method: "PUT", uploadId: expect.any(String), uploadUrl: expect.stringContaining("mock://") });
        await expect(api.registerAsset({ projectId, uploadId: ticket.uploadId, name: "new-room.png", mimeType: "image/png", kind: "IMAGE", width: 640, height: 480 })).rejects.toMatchObject({ code: "UPLOAD_NOT_COMPLETED" });
        const file = new File(["image bytes"], "new-room.png", { type: "image/png" });
        const mockAdapter = setup();
        const mockTicket = await mockAdapter.api.createUploadTicket({ projectId: mockAdapter.initialProjectId, name: file.name, mimeType: file.type, bytes: file.size });
        await mockAdapter.uploadBinary(mockTicket, file);
        const mockRef = await mockAdapter.api.completeUpload({ projectId: mockAdapter.initialProjectId, uploadId: mockTicket.uploadId });
        const registered = await mockAdapter.api.registerAsset({ projectId: mockAdapter.initialProjectId, uploadId: mockTicket.uploadId, name: file.name, mimeType: file.type, kind: "IMAGE", width: 640, height: 480 });
        expect(mockRef.bytes).toBe(file.size);
        expect(await (await mockAdapter.api.readAssetContent(mockAdapter.initialProjectId, registered.assetId)).text()).toBe("image bytes");
        await expect(mockAdapter.api.getAsset(projectId, registered.assetId)).rejects.toMatchObject({ code: "ASSET_PROJECT_MISMATCH" });
        const storageRef = await api.completeUpload({ projectId, uploadId: ticket.uploadId });
        expect(storageRef).toMatchObject({ kind: "OBJECT_STORAGE", mimeType: "image/png" });
        const asset = await api.registerAsset({ projectId, uploadId: ticket.uploadId, name: "new-room.png", mimeType: "image/png", kind: "IMAGE", width: 640, height: 480 });
        expect(asset).toMatchObject({ projectId, name: "new-room.png", storageRef });
        await expect(api.completeUpload({ projectId, uploadId: ticket.uploadId })).rejects.toMatchObject({ code: "UPLOAD_NOT_FOUND" });
    });

    test("cancels unfinished uploads and deletes only unreferenced project assets", async () => {
        const { api, initialProjectId: projectId, projects } = setup();
        const ticket = await api.createUploadTicket({ projectId, name: "cancel.png", mimeType: "image/png", bytes: 1 });
        await api.cancelUpload({ projectId, uploadId: ticket.uploadId });
        await expect(api.completeUpload({ projectId, uploadId: ticket.uploadId })).rejects.toMatchObject({ code: "UPLOAD_NOT_FOUND" });

        const extra = await api.uploadAsset({ projectId, name: "extra.png", mimeType: "image/png", url: "data:image/png;base64,extra", width: 4, height: 4 });
        await expect(api.deleteAsset(projectId, extra.assetId)).resolves.toBeUndefined();
        await expect(api.getAsset(projectId, extra.assetId)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
        const [sample] = await api.listAssets(projectId);
        await expect(api.deleteAsset(projectId, sample.assetId)).rejects.toMatchObject({ code: "ASSET_IN_USE" });
        await expect(api.deleteAsset("other-project", sample.assetId)).rejects.toMatchObject({ code: "ASSET_PROJECT_MISMATCH" });

        const batchAsset = await api.uploadAsset({ projectId, name: "batch.png", mimeType: "image/png", url: "data:image/png;base64,batch", width: 4, height: 4 });
        const referencedAsset = await api.uploadAsset({ projectId, name: "reference.png", mimeType: "image/png", url: "data:image/png;base64,reference", width: 4, height: 4 });
        const versionAsset = await api.uploadAsset({ projectId, name: "version.png", mimeType: "image/png", url: "data:image/png;base64,version", width: 4, height: 4 });
        const project = projects.getState().openProject(projectId)!;
        projects.getState().updateProject(projectId, {
            nodes: [...project.nodes, { id: "batch", type: "image", title: "批量结果", position: { x: 0, y: 0 }, width: 4, height: 4, metadata: { images: [{ id: "batch-item", assetId: batchAsset.assetId, status: "success", content: batchAsset.url, naturalWidth: 4, naturalHeight: 4, bytes: 0, mimeType: batchAsset.mimeType }] } }],
            chatSessions: [{ id: "chat", title: "会话", createdAt: "fixture", updatedAt: "fixture", messages: [{ id: "message", role: "user", text: "参考素材", references: [{ id: "reference", assetId: referencedAsset.assetId, type: "image", title: "参考图" }] }] }],
        });
        await api.saveProjectVersion(projectId, { sourceAssetId: versionAsset.assetId, resultAssetId: null, title: "素材关系版本", createdAt: "fixture", nodes: [], connections: [], backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } });
        await expect(api.deleteAsset(projectId, batchAsset.assetId)).rejects.toMatchObject({ code: "ASSET_IN_USE" });
        await expect(api.deleteAsset(projectId, referencedAsset.assetId)).rejects.toMatchObject({ code: "ASSET_IN_USE" });
        await expect(api.deleteAsset(projectId, versionAsset.assetId)).rejects.toMatchObject({ code: "ASSET_IN_USE" });
    });

    test("registers video and audio assets but keeps Mock generation image-only", async () => {
        const adapter = setup();
        const { api, initialProjectId: projectId, uploadBinary } = adapter;
        const register = async (file: File, metadata: { kind: "VIDEO"; width: number; height: number; durationMs: number } | { kind: "AUDIO"; durationMs: number }) => {
            const ticket = await api.createUploadTicket({ projectId, name: file.name, mimeType: file.type, bytes: file.size });
            await uploadBinary(ticket, file);
            await api.completeUpload({ projectId, uploadId: ticket.uploadId });
            return api.registerAsset({ projectId, uploadId: ticket.uploadId, name: file.name, mimeType: file.type, ...metadata });
        };
        const video = await register(new File(["video"], "room.mp4", { type: "video/mp4" }), { kind: "VIDEO", width: 1280, height: 720, durationMs: 2400 });
        const audio = await register(new File(["audio"], "brief.mp3", { type: "audio/mpeg" }), { kind: "AUDIO", durationMs: 1800 });

        expect(video).toMatchObject({ kind: "VIDEO", width: 1280, height: 720, durationMs: 2400 });
        expect(audio).toMatchObject({ kind: "AUDIO", durationMs: 1800 });
        await expect(api.submitTask({ projectId, type: "GENERATE", prompt: "room", sourceAssetId: video.assetId })).rejects.toMatchObject({ code: "MOCK_SOURCE_ASSET_INVALID" });
    });

    test("accepted -> running -> succeeded is terminal and returns a new asset/version", async () => {
        const { api, initialProjectId: projectId, projects } = setup();
        const [source] = await api.listAssets(projectId);
        const response = await api.submitTask({ projectId, type: "GENERATE", prompt: "room", sourceAssetId: source.assetId });
        expect(response).toMatchObject({ status: 202, taskId: expect.any(String) });
        expect((await api.getTask(response.taskId)).status).toBe("RUNNING");
        const result = await api.getTask(response.taskId);
        expect(result.status).toBe("SUCCEEDED");
        expect(result.resultAssetId).not.toBe(source.assetId);
        expect(result.versionId).toBeTruthy();
        expect(await api.getTask(response.taskId)).toEqual(result);
        expect(await api.listAssets(projectId)).toHaveLength(2);
        expect(await api.listVersions(projectId)).toHaveLength(1);
        expect(projects.getState().openProject(projectId)?.versions[0].nodes).toHaveLength(2);
        expect("pollCount" in result).toBe(false);
        expect("simulateFailure" in result).toBe(false);
    });

    test("edit keeps the source asset and previous immutable version", async () => {
        const { api, initialProjectId: projectId, projects } = setup();
        const [source] = await api.listAssets(projectId);
        const first = await api.submitTask({ projectId, type: "EDIT", prompt: "first", sourceAssetId: source.assetId, referenceAssetIds: [source.assetId] });
        await api.getTask(first.taskId);
        const result = await api.getTask(first.taskId);
        const snapshot = structuredClone(projects.getState().openProject(projectId)?.versions[0]);
        const second = await api.submitTask({ projectId, type: "EDIT", prompt: "second", sourceAssetId: result.resultAssetId!, sourceVersionId: result.versionId!, referenceAssetIds: [result.resultAssetId!] });
        await api.getTask(second.taskId);
        const edited = await api.getTask(second.taskId);
        expect(edited.versionId).not.toBe(result.versionId);
        expect(edited.resultAssetId).not.toBe(result.resultAssetId);
        expect(await api.getProjectVersion(projectId, edited.versionId!)).toMatchObject({ sourceAssetId: result.resultAssetId, resultAssetId: edited.resultAssetId });
        expect(await api.getProjectVersion(projectId, result.versionId!)).toMatchObject({ sourceAssetId: source.assetId, resultAssetId: result.resultAssetId });
        expect((await api.listAssets(projectId)).find((asset) => asset.assetId === source.assetId)).toEqual(source);
        expect(
            projects
                .getState()
                .openProject(projectId)
                ?.versions.find((version) => version.id === result.versionId),
        ).toEqual(snapshot);
        expect(await api.listVersions(projectId)).toHaveLength(2);
    });

    test("failure is terminal, has an error and creates no result/version", async () => {
        const { api, initialProjectId: projectId } = setup();
        const [source] = await api.listAssets(projectId);
        const response = await api.submitTask({ projectId, type: "EDIT", prompt: "fail", sourceAssetId: source.assetId }, { simulateFailure: true });
        expect((await api.getTask(response.taskId)).status).toBe("RUNNING");
        const result = await api.getTask(response.taskId);
        expect(result.status).toBe("FAILED");
        expect(result.error?.code).toBe("MOCK_GENERATION_FAILED");
        expect(result.resultAssetId).toBeNull();
        expect(result.versionId).toBeNull();
        expect(await api.getTask(response.taskId)).toEqual(result);
        expect(await api.listAssets(projectId)).toHaveLength(1);
        expect(await api.listVersions(projectId)).toHaveLength(0);
    });

    test("projects and adapter instances are isolated; ownership is enforced", async () => {
        const { api, initialProjectId: projectId } = setup();
        const [source] = await api.listAssets(projectId);
        const other = await api.createProject("other");
        expect((await api.listProjects()).map(({ projectId: id }) => id)).toEqual(expect.arrayContaining([projectId, other.projectId]));
        expect(await api.listAssets(other.projectId)).toEqual([]);
        await expect(api.submitTask({ projectId: other.projectId, type: "EDIT", prompt: "room", sourceAssetId: source.assetId })).rejects.toThrow("源素材不属于当前项目");
        await expect(setup().api.getProject(projectId)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
        await expect(api.getTask("missing")).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
        await expect(api.getTask("missing")).rejects.toBeInstanceOf(CanvasApiError);
    });

    test("edit task references must be image assets owned by the current project", async () => {
        const { api, initialProjectId: projectId } = setup();
        const [source] = await api.listAssets(projectId);
        const other = await api.createProject("other");
        const otherSource = await api.uploadAsset({ projectId: other.projectId, name: "other.png", mimeType: "image/png", url: "data:image/png;base64,other", width: 10, height: 10 });
        await expect(api.submitTask({ projectId, type: "EDIT", prompt: "mask edit", sourceAssetId: source.assetId, referenceAssetIds: [otherSource.assetId] })).rejects.toThrow("引用素材不属于当前项目");

        const adapter = setup();
        const testProjectId = adapter.initialProjectId;
        const [testSource] = await adapter.api.listAssets(testProjectId);
        const ticket = await adapter.api.createUploadTicket({ projectId: testProjectId, name: "clip.mp4", mimeType: "video/mp4", bytes: 1 });
        await adapter.uploadBinary(ticket, new File(["v"], "clip.mp4", { type: "video/mp4" }));
        await adapter.api.completeUpload({ projectId: testProjectId, uploadId: ticket.uploadId });
        const video = await adapter.api.registerAsset({ projectId: testProjectId, uploadId: ticket.uploadId, name: "clip.mp4", mimeType: "video/mp4", kind: "VIDEO", width: 10, height: 10 });
        await expect(adapter.api.submitTask({ projectId: testProjectId, type: "EDIT", prompt: "mask edit", sourceAssetId: testSource.assetId, referenceAssetIds: [video.assetId] })).rejects.toMatchObject({ code: "MOCK_REFERENCE_ASSET_INVALID" });
    });

    test("invalid edits and mismatched version references are rejected", async () => {
        const { api, initialProjectId: projectId } = setup();
        const [source] = await api.listAssets(projectId);
        await expect(api.submitTask({ projectId, type: "EDIT", prompt: "room" })).rejects.toMatchObject({ code: "EDIT_SOURCE_REQUIRED" });
        await expect(api.submitTask({ projectId, type: "GENERATE", prompt: " " })).rejects.toMatchObject({ code: "INVALID_PROMPT" });
        const response = await api.submitTask({ projectId, type: "GENERATE", prompt: "room" });
        await api.getTask(response.taskId);
        const result = await api.getTask(response.taskId);
        await expect(api.submitTask({ projectId, type: "EDIT", prompt: "room", sourceAssetId: source.assetId, sourceVersionId: result.versionId! })).rejects.toMatchObject({ code: "SOURCE_VERSION_ASSET_MISMATCH" });
    });

    test("does not accept a task when its submission signal is already aborted", async () => {
        const { api, initialProjectId: projectId } = setup();
        const controller = new AbortController();
        controller.abort();

        await expect(api.submitTask({ projectId, type: "GENERATE", prompt: "room" }, { signal: controller.signal })).rejects.toThrow();
    });

    test("an empty project fails deterministically; returned DTOs cannot mutate stored state", async () => {
        const { api, initialProjectId } = setup();
        const [asset] = await api.listAssets(initialProjectId);
        asset.name = "mutated";
        expect((await api.listAssets(initialProjectId))[0].name).toBe("room.png");
        const project = await api.createProject("empty");
        const response = await api.submitTask({ projectId: project.projectId, type: "GENERATE", prompt: "room" });
        await api.getTask(response.taskId);
        const failed = await api.getTask(response.taskId);
        expect(failed.status).toBe("FAILED");
        expect(failed.error?.code).toBe("MOCK_SOURCE_ASSET_NOT_FOUND");
        failed.error!.message = "mutated";
        expect((await api.getTask(response.taskId)).error?.message).not.toBe("mutated");
    });
});
