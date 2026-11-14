import { describe, expect, test, vi } from "vitest";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
const { createMockCanvasWorkflow } = await import("../src/services/api/canvas/mock-workflow");
const { createMockCanvasAdapter } = await import("../src/services/api/canvas/mock-adapter");
const { createCanvasTaskResultCommand } = await import("../src/services/api/canvas/task-workflow");

const setup = (taskProgression?: "poll" | "manual") => {
    const adapter = createMockCanvasAdapter({ taskProgression, sampleAsset: { name: "room.png", mimeType: "image/png", url: "data:image/png;base64,fixture", width: 960, height: 640 } });
    return { adapter, workflow: createMockCanvasWorkflow(adapter) };
};

describe("Mock canvas workflow", () => {
    test("loads a project, submits a task, and refreshes its successful result", async () => {
        const { adapter, workflow } = setup();
        const projectId = adapter.initialProjectId;
        const initial = await workflow.loadProject(projectId);
        expect(initial.assets).toHaveLength(1);
        const task = await workflow.submitTask({ projectId, type: "GENERATE", prompt: "natural room", sourceAssetId: initial.assets[0].assetId });
        expect(task).toMatchObject({ projectId, status: "QUEUED", resultAssetId: null, versionId: null });
        expect((await workflow.queryTask(task.taskId)).task.status).toBe("RUNNING");
        const result = await workflow.queryTask(task.taskId);
        expect(result.task.status).toBe("SUCCEEDED");
        expect(result.resultAsset?.assetId).toBe(result.task.resultAssetId);
        expect(result.versions).toHaveLength(1);
        expect(result.assets).toHaveLength(2);
        const savedVersion = await adapter.api.getProjectVersion(projectId, result.task.versionId!);
        expect(savedVersion).toMatchObject({ sourceAssetId: initial.assets[0].assetId, resultAssetId: result.task.resultAssetId });
    });

    test("keeps failed task results isolated from project assets and versions", async () => {
        const { adapter, workflow } = setup();
        const projectId = adapter.initialProjectId;
        const [source] = (await workflow.loadProject(projectId)).assets;
        const task = await workflow.submitTask({ projectId, type: "EDIT", prompt: "fail", sourceAssetId: source.assetId }, { simulateFailure: true });
        expect((await workflow.queryTask(task.taskId)).task.status).toBe("RUNNING");
        const result = await workflow.queryTask(task.taskId);
        expect(result.task).toMatchObject({ status: "FAILED", resultAssetId: null, versionId: null, error: { code: "MOCK_GENERATION_FAILED" } });
        expect(result.assets).toBeUndefined();
        expect(result.versions).toBeUndefined();
        expect(await workflow.loadProject(projectId)).toMatchObject({ assets: [source], versions: [] });
    });

    test("supports explicit task progression without using poll count", async () => {
        const { adapter, workflow } = setup("manual");
        const projectId = adapter.initialProjectId;
        const [source] = (await workflow.loadProject(projectId)).assets;
        const task = await workflow.submitTask({ projectId, type: "GENERATE", prompt: "manual", sourceAssetId: source.assetId });

        expect((await workflow.queryTask(task.taskId)).task.status).toBe("QUEUED");
        expect(workflow.advanceTask(task.taskId, "RUNNING").status).toBe("RUNNING");
        expect((await workflow.queryTask(task.taskId)).task.status).toBe("RUNNING");
        const succeeded = workflow.advanceTask(task.taskId, "SUCCEEDED");
        expect(succeeded.status).toBe("SUCCEEDED");
        expect(workflow.advanceTask(task.taskId, "FAILED")).toMatchObject({ status: "SUCCEEDED" });
        expect((await workflow.loadProject(projectId)).versions).toHaveLength(1);
    });

    test("does not duplicate assets or versions when a successful task result is queried repeatedly", async () => {
        const { adapter, workflow } = setup("manual");
        const projectId = adapter.initialProjectId;
        const [source] = (await workflow.loadProject(projectId)).assets;
        const task = await workflow.submitTask({ projectId, type: "GENERATE", prompt: "idempotent", sourceAssetId: source.assetId });
        workflow.advanceTask(task.taskId, "RUNNING");
        workflow.advanceTask(task.taskId, "SUCCEEDED");

        const first = await workflow.queryTask(task.taskId);
        const second = await workflow.queryTask(task.taskId);
        const firstCommand = createCanvasTaskResultCommand(first);
        const secondCommand = createCanvasTaskResultCommand(second);
        const project = await workflow.loadProject(projectId);

        expect(firstCommand).toEqual(secondCommand);
        expect(project.assets).toHaveLength(2);
        expect(project.versions).toHaveLength(1);
        expect(second.task).toMatchObject({ taskId: task.taskId, resultAssetId: first.task.resultAssetId, versionId: first.task.versionId });
    });

    test("maps a current successful task update to one editor asset command", async () => {
        const { adapter, workflow } = setup("manual");
        const projectId = adapter.initialProjectId;
        const [source] = (await workflow.loadProject(projectId)).assets;
        const task = await workflow.submitTask({ projectId, type: "GENERATE", prompt: "update", sourceAssetId: source.assetId });
        workflow.advanceTask(task.taskId, "RUNNING");
        workflow.advanceTask(task.taskId, "SUCCEEDED");

        const update = await workflow.updateTask(task.taskId, { projectId, taskId: task.taskId }, {
            signal: new AbortController().signal,
            isCurrent: () => true,
        });

        expect(update?.task.status).toBe("SUCCEEDED");
        expect(update?.assetCommand).toMatchObject({
            taskId: task.taskId,
            versionId: update?.task.versionId,
            asset: { assetId: update?.task.resultAssetId, projectId },
        });
    });

    test("drops a Mock task update after its host request becomes stale", async () => {
        const { adapter, workflow } = setup("manual");
        const projectId = adapter.initialProjectId;
        const task = await workflow.submitTask({ projectId, type: "GENERATE", prompt: "stale" });

        await expect(workflow.updateTask(task.taskId, { projectId, taskId: task.taskId }, {
            signal: new AbortController().signal,
            isCurrent: () => false,
        })).resolves.toBeUndefined();
    });

    test("keeps manual failures terminal and isolated", async () => {
        const { adapter, workflow } = setup("manual");
        const projectId = adapter.initialProjectId;
        const [source] = (await workflow.loadProject(projectId)).assets;
        const task = await workflow.submitTask({ projectId, type: "EDIT", prompt: "manual fail", sourceAssetId: source.assetId });

        workflow.advanceTask(task.taskId, "RUNNING");
        const failed = workflow.advanceTask(task.taskId, "FAILED");
        expect(failed).toMatchObject({ status: "FAILED", resultAssetId: null, versionId: null });
        expect(workflow.advanceTask(task.taskId, "SUCCEEDED")).toMatchObject({ status: "FAILED" });
        expect(await workflow.loadProject(projectId)).toMatchObject({ assets: [source], versions: [] });
    });

    test("exposes the shared polling boundary without choosing a polling policy", async () => {
        const { adapter, workflow } = setup();
        const projectId = adapter.initialProjectId;
        const [source] = (await workflow.loadProject(projectId)).assets;
        const task = await workflow.submitTask({ projectId, type: "GENERATE", prompt: "poll", sourceAssetId: source.assetId });
        const wait = vi.fn().mockResolvedValue(undefined);
        const statuses: string[] = [];
        const result = await workflow.pollTask(task.taskId, { intervalMs: 0, wait, onSnapshot: (snapshot) => statuses.push(snapshot.task.status) });
        expect(statuses).toEqual(["RUNNING", "SUCCEEDED"]);
        expect(result.resultAsset?.projectId).toBe(projectId);
        expect(wait).toHaveBeenCalledTimes(1);
    });

    test("passes a project load cancellation signal to asset and version readers", async () => {
        const { adapter, workflow } = setup();
        const signal = new AbortController().signal;
        const listAssets = vi.spyOn(adapter.hostAdapters.assets!, "listAssets");
        const listVersions = vi.spyOn(adapter.hostAdapters.results!, "listVersions");

        await workflow.loadProject(adapter.initialProjectId, signal);

        expect(listAssets).toHaveBeenCalledWith(adapter.initialProjectId, signal);
        expect(listVersions).toHaveBeenCalledWith(adapter.initialProjectId, signal);
    });

    test("deleting a project removes its Mock assets and versions", async () => {
        const { adapter, workflow } = setup();
        const projectId = adapter.initialProjectId;
        const [source] = (await workflow.loadProject(projectId)).assets;
        const task = await workflow.submitTask({ projectId, type: "GENERATE", prompt: "delete me", sourceAssetId: source.assetId });
        await workflow.queryTask(task.taskId);
        const result = await workflow.queryTask(task.taskId);
        expect(result.versions).toHaveLength(1);

        await adapter.api.deleteProject(projectId);

        await expect(adapter.api.listAssets(projectId)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
        await expect(adapter.api.listVersions(projectId)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
        await expect(adapter.api.getProjectVersion(projectId, result.task.versionId!)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    });
});
