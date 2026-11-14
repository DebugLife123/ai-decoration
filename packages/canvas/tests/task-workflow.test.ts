import { describe, expect, test, vi } from "vitest";
import { assertCanvasTaskProject, createCanvasTaskExecution, createCanvasTaskResultCommand, createQueuedCanvasTask, pollCanvasTask, queryCanvasTask, resolveCanvasTaskUpdate, runCanvasTaskUpdate, submitCanvasTask } from "../src/services/api/canvas/task-workflow";
import type { CanvasAsset, CanvasTask, CanvasVersion } from "../src/features/canvas/contracts";

const task = (status: CanvasTask["status"], values: Partial<CanvasTask> = {}): CanvasTask => ({
    taskId: "task-1", projectId: "project-1", type: "GENERATE", status, sourceAssetId: null, sourceVersionId: null,
    resultAssetId: status === "SUCCEEDED" ? "asset-result" : null, versionId: status === "SUCCEEDED" ? "version-1" : null,
    error: status === "FAILED" ? { code: "MOCK_FAILED", message: "failed" } : null, createdAt: "created", updatedAt: "updated", ...values,
});

const asset: CanvasAsset = { assetId: "asset-result", projectId: "project-1", name: "result.png", kind: "IMAGE", mimeType: "image/png", url: "data:image/png;base64,result", width: 10, height: 10, createdAt: "created" };
const version: CanvasVersion = { versionId: "version-1", projectId: "project-1", sourceAssetId: null, resultAssetId: asset.assetId, createdAt: "created", name: "Mock result" };

describe("Canvas task workflow", () => {
    test("assembles one task execution port without choosing a polling interval", async () => {
        const tasks = { submitTask: vi.fn().mockResolvedValue({ status: 202 as const, taskId: "task-1" }), getTask: vi.fn().mockResolvedValue(task("RUNNING")) };
        const results = { listAssets: vi.fn(), listVersions: vi.fn() };
        const execution = createCanvasTaskExecution(tasks, results);

        await expect(execution.submit({ projectId: "project-1", type: "GENERATE", prompt: "room" })).resolves.toMatchObject({ taskId: "task-1", status: "QUEUED" });
        await expect(execution.query("task-1")).resolves.toEqual({ task: task("RUNNING") });
        expect(results.listAssets).not.toHaveBeenCalled();
    });
    test("normalizes the accepted response into a project-scoped queued task", () => {
        expect(createQueuedCanvasTask({ projectId: "project-1", type: "EDIT", prompt: "refresh", sourceAssetId: "source-1", sourceVersionId: "source-version" }, { status: 202, taskId: "task-accepted" }, "now"))
            .toEqual({
                taskId: "task-accepted", projectId: "project-1", type: "EDIT", status: "QUEUED",
                sourceAssetId: "source-1", sourceVersionId: "source-version", resultAssetId: null, versionId: null,
                error: null, createdAt: "now", updatedAt: "now",
            });
    });

    test("submits through the task adapter and returns the normalized queued snapshot", async () => {
        const input = { projectId: "project-1", type: "GENERATE" as const, prompt: "room" };
        const options = { simulateFailure: true };
        const submitTask = vi.fn().mockResolvedValue({ status: 202 as const, taskId: "task-submitted" });

        await expect(submitCanvasTask({ submitTask, getTask: vi.fn() }, input, options)).resolves.toMatchObject({
            taskId: "task-submitted", projectId: input.projectId, status: "QUEUED", type: input.type,
        });
        expect(submitTask).toHaveBeenCalledWith(input, options);
    });

    test("passes cancellation through the task execution port", async () => {
        const controller = new AbortController();
        const submitTask = vi.fn().mockResolvedValue({ status: 202 as const, taskId: "task-cancelable" });
        const execution = createCanvasTaskExecution({ submitTask, getTask: vi.fn() }, { listAssets: vi.fn(), listVersions: vi.fn() });

        await execution.submit({ projectId: "project-1", type: "GENERATE", prompt: "room" }, { signal: controller.signal });

        expect(submitTask).toHaveBeenCalledWith({ projectId: "project-1", type: "GENERATE", prompt: "room" }, { signal: controller.signal });
    });

    test("does not call the task adapter when submission is already canceled", async () => {
        const controller = new AbortController();
        const submitTask = vi.fn();
        const execution = createCanvasTaskExecution({ submitTask, getTask: vi.fn() }, { listAssets: vi.fn(), listVersions: vi.fn() });
        controller.abort();

        await expect(execution.submit({ projectId: "project-1", type: "GENERATE", prompt: "room" }, { signal: controller.signal })).rejects.toThrow();
        expect(submitTask).not.toHaveBeenCalled();
    });

    test("rejects a task snapshot from a different current project", () => {
        expect(assertCanvasTaskProject({ task: task("RUNNING") }, "project-1")).toEqual({ task: task("RUNNING") });
        expect(() => assertCanvasTaskProject({ task: task("RUNNING") }, "project-2")).toThrow("任务不属于当前项目");
        expect(() => assertCanvasTaskProject({ task: task("SUCCEEDED"), assets: [asset], versions: [version], resultAsset: asset }, "project-2")).toThrow("任务不属于当前项目");
        expect(() => assertCanvasTaskProject({ task: task("SUCCEEDED"), assets: [{ ...asset, projectId: "project-2" }], versions: [version], resultAsset: asset }, "project-1")).toThrow("任务结果不属于当前项目");
        expect(() => assertCanvasTaskProject({ task: task("SUCCEEDED"), assets: [asset], versions: [version], resultAsset: { ...asset, projectId: "project-2" } }, "project-1")).toThrow("任务结果不属于当前项目");
    });

    test.each(["QUEUED", "RUNNING", "FAILED"] as const)("returns %s without querying result collections", async (status) => {
        const tasks = { getTask: vi.fn().mockResolvedValue(task(status)) };
        const results = { listAssets: vi.fn(), listVersions: vi.fn() };
        const snapshot = await queryCanvasTask(tasks, results, "task-1");
        expect(snapshot).toEqual({ task: task(status) });
        expect(results.listAssets).not.toHaveBeenCalled();
        expect(results.listVersions).not.toHaveBeenCalled();
    });

    test("loads successful task assets and versions in parallel and resolves the result asset", async () => {
        const tasks = { getTask: vi.fn().mockResolvedValue(task("SUCCEEDED")) };
        const results = { listAssets: vi.fn().mockResolvedValue([asset]), listVersions: vi.fn().mockResolvedValue([version]) };
        const snapshot = await queryCanvasTask(tasks, results, "task-1");
        expect(snapshot).toEqual({ task: task("SUCCEEDED"), assets: [asset], versions: [version], resultAsset: asset });
        expect(results.listAssets).toHaveBeenCalledWith("project-1", undefined);
        expect(results.listVersions).toHaveBeenCalledWith("project-1", undefined);
    });

    test("maps a successful task snapshot to an editor command with all three identities", async () => {
        const snapshot = await queryCanvasTask(
            { getTask: vi.fn().mockResolvedValue(task("SUCCEEDED")) },
            { listAssets: vi.fn().mockResolvedValue([asset]), listVersions: vi.fn().mockResolvedValue([version]) },
            "task-1",
        );

        expect(createCanvasTaskResultCommand(snapshot)).toEqual({
            requestId: JSON.stringify(["task-1", "version-1"]), asset, taskId: "task-1", versionId: "version-1",
        });
        expect(resolveCanvasTaskUpdate(snapshot, { projectId: "project-1", taskId: "task-1" })).toEqual({
            task: snapshot.task, assets: [asset], versions: [version],
            assetCommand: { requestId: JSON.stringify(["task-1", "version-1"]), asset, taskId: "task-1", versionId: "version-1" },
        });
        expect(createCanvasTaskResultCommand({ task: task("RUNNING") })).toBeUndefined();
    });

    test.each([
        { projectId: "project-1", taskId: "task-other", message: "任务响应与请求不匹配" },
        { projectId: "project-2", taskId: "task-1", message: "任务不属于当前项目" },
    ])("rejects stale task update scope: $message", async ({ projectId, taskId, message }) => {
        const snapshot = await queryCanvasTask(
            { getTask: vi.fn().mockResolvedValue(task("SUCCEEDED")) },
            { listAssets: vi.fn().mockResolvedValue([asset]), listVersions: vi.fn().mockResolvedValue([version]) },
            "task-1",
        );
        expect(() => resolveCanvasTaskUpdate(snapshot, { projectId, taskId })).toThrow(message);
    });

    test.each(["QUEUED", "RUNNING", "FAILED"] as const)("does not create an asset command for %s tasks", (status) => {
        const snapshot = { task: task(status) };
        expect(resolveCanvasTaskUpdate(snapshot, { projectId: "project-1", taskId: "task-1" })).toEqual({ task: snapshot.task });
    });

    test("does not resolve an update after its request is cancelled", () => {
        const controller = new AbortController();
        controller.abort();
        expect(() => resolveCanvasTaskUpdate({ task: task("RUNNING") }, { projectId: "project-1", taskId: "task-1", signal: controller.signal }))
            .toThrow(expect.objectContaining({ name: "AbortError" }));
    });

    test("runs a current task update and passes its scoped query options", async () => {
        const signal = new AbortController().signal;
        const query = vi.fn().mockResolvedValue({ task: task("RUNNING") });
        await expect(runCanvasTaskUpdate(query, { projectId: "project-1", taskId: "task-1" }, { signal, isCurrent: () => true }))
            .resolves.toEqual({ task: task("RUNNING") });
        expect(query).toHaveBeenCalledWith({ projectId: "project-1", signal });
    });

    test("drops a task update when the request guard becomes stale", async () => {
        const query = vi.fn().mockResolvedValue({ task: task("SUCCEEDED"), assets: [asset], versions: [version], resultAsset: asset });
        await expect(runCanvasTaskUpdate(query, { projectId: "project-1", taskId: "task-1" }, { signal: new AbortController().signal, isCurrent: () => false }))
            .resolves.toBeUndefined();
    });

    test("drops a stale query failure instead of surfacing it to a newer task", async () => {
        const query = vi.fn().mockRejectedValue(new Error("old task failed"));
        await expect(runCanvasTaskUpdate(query, { projectId: "project-1", taskId: "task-1" }, {
            signal: new AbortController().signal,
            isCurrent: () => false,
        })).resolves.toBeUndefined();
    });

    test("preserves the original error for the current request", async () => {
        const failure = new Error("task query failed");
        await expect(runCanvasTaskUpdate(vi.fn().mockRejectedValue(failure), { projectId: "project-1", taskId: "task-1" }, {
            signal: new AbortController().signal,
            isCurrent: () => true,
        })).rejects.toBe(failure);
    });

    test("propagates cancellation that arrives while querying", async () => {
        const controller = new AbortController();
        let release!: (snapshot: CanvasTaskSnapshot) => void;
        const query = vi.fn(() => new Promise<CanvasTaskSnapshot>((resolve) => { release = resolve; }));
        const pending = runCanvasTaskUpdate(query, { projectId: "project-1", taskId: "task-1" }, { signal: controller.signal });
        controller.abort();
        release({ task: task("RUNNING") });
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    });

    test("rejects task result commands when asset or version identity changes", async () => {
        const snapshot = await queryCanvasTask(
            { getTask: vi.fn().mockResolvedValue(task("SUCCEEDED")) },
            { listAssets: vi.fn().mockResolvedValue([asset]), listVersions: vi.fn().mockResolvedValue([version]) },
            "task-1",
        );

        expect(() => createCanvasTaskResultCommand({ ...snapshot, resultAsset: { ...asset, projectId: "other" } })).toThrow("任务结果素材身份不匹配");
        expect(() => createCanvasTaskResultCommand({ ...snapshot, versions: [{ ...version, resultAssetId: "other" }] })).toThrow("任务结果版本身份不匹配");
    });

    test("rejects a task response for a different task ID", async () => {
        const tasks = { getTask: vi.fn().mockResolvedValue(task("RUNNING", { taskId: "task-other" })) };
        const results = { listAssets: vi.fn(), listVersions: vi.fn() };

        await expect(queryCanvasTask(tasks, results, "task-1")).rejects.toThrow("任务响应与请求不匹配");
        expect(results.listAssets).not.toHaveBeenCalled();
        expect(results.listVersions).not.toHaveBeenCalled();
    });

    test.each([
        { resultAssetId: null, versionId: "version-1" },
        { resultAssetId: "asset-result", versionId: null },
    ])("rejects a successful task without both result identities (%o)", (identities) => {
        const tasks = { getTask: vi.fn().mockResolvedValue(task("SUCCEEDED", identities)) };
        const results = { listAssets: vi.fn(), listVersions: vi.fn() };

        return expect(queryCanvasTask(tasks, results, "task-1")).rejects.toThrow("成功任务缺少结果素材或版本 ID");
    });

    test("passes one cancellation signal through task and result readers", async () => {
        const controller = new AbortController();
        const tasks = { getTask: vi.fn().mockResolvedValue(task("SUCCEEDED")) };
        const results = { listAssets: vi.fn().mockResolvedValue([asset]), listVersions: vi.fn().mockResolvedValue([version]) };

        await queryCanvasTask(tasks, results, "task-1", controller.signal);

        expect(tasks.getTask).toHaveBeenCalledWith("task-1", controller.signal);
        expect(results.listAssets).toHaveBeenCalledWith("project-1", controller.signal);
        expect(results.listVersions).toHaveBeenCalledWith("project-1", controller.signal);
    });

    test("rejects a task from another project before loading its result collections", async () => {
        const listAssets = vi.fn();
        const listVersions = vi.fn();
        await expect(queryCanvasTask(
            { getTask: vi.fn().mockResolvedValue(task("SUCCEEDED", { projectId: "project-2" })) },
            { listAssets, listVersions },
            "task-1",
            { projectId: "project-1" },
        )).rejects.toThrow("任务不属于当前项目");
        expect(listAssets).not.toHaveBeenCalled();
        expect(listVersions).not.toHaveBeenCalled();
    });

    test("propagates query failures and rejects cross-project result collections", async () => {
        await expect(queryCanvasTask({ getTask: vi.fn().mockRejectedValue(new Error("offline")) }, { listAssets: vi.fn(), listVersions: vi.fn() }, "task-1")).rejects.toThrow("offline");
        await expect(queryCanvasTask({ getTask: vi.fn().mockResolvedValue(task("SUCCEEDED")) }, { listAssets: vi.fn().mockResolvedValue([{ ...asset, projectId: "other" }]), listVersions: vi.fn().mockResolvedValue([version]) }, "task-1")).rejects.toThrow("不属于当前项目");
        await expect(queryCanvasTask({ getTask: vi.fn().mockResolvedValue(task("SUCCEEDED")) }, { listAssets: vi.fn().mockResolvedValue([asset]), listVersions: vi.fn().mockResolvedValue([{ ...version, resultAssetId: "other" }]) }, "task-1")).rejects.toThrow("结果素材或版本不一致");
    });

    test("polls only until a terminal task state and publishes each snapshot", async () => {
        const queued = task("QUEUED");
        const running = task("RUNNING");
        const succeeded = task("SUCCEEDED");
        const getTask = vi.fn().mockResolvedValueOnce(queued).mockResolvedValueOnce(running).mockResolvedValueOnce(succeeded);
        const wait = vi.fn().mockResolvedValue(undefined);
        const snapshots: string[] = [];
        const result = await pollCanvasTask({ getTask }, { listAssets: vi.fn().mockResolvedValue([asset]), listVersions: vi.fn().mockResolvedValue([version]) }, queued.taskId, {
            intervalMs: 250,
            wait,
            onSnapshot: (snapshot) => snapshots.push(snapshot.task.status),
        });
        expect(result.task.status).toBe("SUCCEEDED");
        expect(snapshots).toEqual(["QUEUED", "RUNNING", "SUCCEEDED"]);
        expect(wait).toHaveBeenCalledTimes(2);
        expect(wait).toHaveBeenNthCalledWith(1, 250, undefined);
        expect(wait).toHaveBeenNthCalledWith(2, 250, undefined);
    });

    test("stops before querying when the polling signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const getTask = vi.fn();
        await expect(pollCanvasTask({ getTask }, { listAssets: vi.fn(), listVersions: vi.fn() }, "task-1", {
            intervalMs: 0,
            wait: vi.fn(),
            signal: controller.signal,
        })).rejects.toMatchObject({ name: "AbortError" });
        expect(getTask).not.toHaveBeenCalled();
    });

    test("does not publish a snapshot when cancellation happens during task query", async () => {
        const controller = new AbortController();
        let releaseTask!: (value: CanvasTask) => void;
        const getTask = vi.fn(() => new Promise<CanvasTask>((resolve) => { releaseTask = resolve; }));
        const onSnapshot = vi.fn();
        const pending = pollCanvasTask({ getTask }, { listAssets: vi.fn(), listVersions: vi.fn() }, "task-1", {
            intervalMs: 0,
            wait: vi.fn(),
            signal: controller.signal,
            onSnapshot,
        });

        await Promise.resolve();
        controller.abort();
        releaseTask(task("QUEUED"));

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    test("rejects invalid polling intervals before touching the task API", async () => {
        const getTask = vi.fn();
        await expect(pollCanvasTask({ getTask }, { listAssets: vi.fn(), listVersions: vi.fn() }, "task-1", {
            intervalMs: -1,
            wait: vi.fn(),
        })).rejects.toThrow("任务轮询间隔无效");
        expect(getTask).not.toHaveBeenCalled();
    });
});
