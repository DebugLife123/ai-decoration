import type { AcceptedCanvasTask, CanvasEditorAssetCommand, CanvasProjectAsset, CanvasTask, CanvasTaskApi, CanvasTaskResultApi, CanvasVersion, SubmitCanvasTask, SubmitCanvasTaskOptions } from "../../../features/canvas/contracts";

export type CanvasTaskSnapshot = {
    task: CanvasTask;
    assets?: CanvasProjectAsset[];
    versions?: CanvasVersion[];
    resultAsset?: CanvasProjectAsset;
};

export type CanvasTaskQueryOptions = { projectId?: string; signal?: AbortSignal };
export type CanvasTaskUpdate = { task: CanvasTask; assets?: CanvasProjectAsset[]; versions?: CanvasVersion[]; assetCommand?: CanvasEditorAssetCommand };
export type CanvasTaskUpdateRunnerOptions = { signal: AbortSignal; isCurrent?: () => boolean };
export type CanvasTaskExecution = {
    submit(input: SubmitCanvasTask, options?: SubmitCanvasTaskOptions): Promise<CanvasTask>;
    query(taskId: string, options?: CanvasTaskQueryOptions | AbortSignal): Promise<CanvasTaskSnapshot>;
    update(taskId: string, expected: { projectId: string; taskId: string }, options: CanvasTaskUpdateRunnerOptions): Promise<CanvasTaskUpdate | undefined>;
    poll(taskId: string, options: CanvasTaskPollingOptions): Promise<CanvasTaskSnapshot>;
};

export function createCanvasTaskExecution(tasks: CanvasTaskApi, results: CanvasTaskResultApi): CanvasTaskExecution {
    return {
        submit: (input, options) => submitCanvasTask(tasks, input, options),
        query: (taskId, options) => queryCanvasTask(tasks, results, taskId, options),
        update: (taskId, expected, options) => runCanvasTaskUpdate((queryOptions) => queryCanvasTask(tasks, results, taskId, queryOptions), expected, options),
        poll: (taskId, options) => pollCanvasTask(tasks, results, taskId, options),
    };
}

export function assertCanvasTaskProject(snapshot: CanvasTaskSnapshot, projectId: string): CanvasTaskSnapshot {
    if (snapshot.task.projectId !== projectId) throw new Error("任务不属于当前项目");
    if (snapshot.assets?.some((asset) => asset.projectId !== projectId) || snapshot.versions?.some((version) => version.projectId !== projectId) || (snapshot.resultAsset && snapshot.resultAsset.projectId !== projectId)) {
        throw new Error("任务结果不属于当前项目");
    }
    return snapshot;
}

export function createQueuedCanvasTask(input: SubmitCanvasTask, accepted: AcceptedCanvasTask, now = new Date().toISOString()): CanvasTask {
    return {
        taskId: accepted.taskId,
        projectId: input.projectId,
        type: input.type,
        status: "QUEUED",
        sourceAssetId: input.sourceAssetId || null,
        sourceVersionId: input.sourceVersionId || null,
        resultAssetId: null,
        versionId: null,
        error: null,
        createdAt: now,
        updatedAt: now,
    };
}

export async function submitCanvasTask(tasks: CanvasTaskApi, input: SubmitCanvasTask, options?: SubmitCanvasTaskOptions): Promise<CanvasTask> {
    options?.signal?.throwIfAborted();
    const accepted = await tasks.submitTask(input, options);
    options?.signal?.throwIfAborted();
    return createQueuedCanvasTask(input, accepted);
}

export function createCanvasTaskResultCommand(snapshot: CanvasTaskSnapshot): CanvasEditorAssetCommand | undefined {
    const { task, resultAsset, versions } = snapshot;
    if (task.status !== "SUCCEEDED") return undefined;
    if (!task.resultAssetId || !task.versionId || !resultAsset) throw new Error("成功任务缺少结果素材或版本 ID");
    if (resultAsset.projectId !== task.projectId || resultAsset.assetId !== task.resultAssetId) throw new Error("任务结果素材身份不匹配");
    const version = versions?.find((item) => item.versionId === task.versionId);
    if (!version || version.projectId !== task.projectId || version.resultAssetId !== resultAsset.assetId) throw new Error("任务结果版本身份不匹配");
    return { requestId: JSON.stringify([task.taskId, task.versionId]), asset: resultAsset, taskId: task.taskId, versionId: task.versionId };
}

export function resolveCanvasTaskUpdate(snapshot: CanvasTaskSnapshot, expected: { projectId: string; taskId: string; signal?: AbortSignal }): CanvasTaskUpdate {
    expected.signal?.throwIfAborted();
    if (snapshot.task.taskId !== expected.taskId) throw new Error("任务响应与请求不匹配");
    assertCanvasTaskProject(snapshot, expected.projectId);
    const assetCommand = createCanvasTaskResultCommand(snapshot);
    return {
        task: snapshot.task,
        ...(snapshot.assets ? { assets: snapshot.assets } : {}),
        ...(snapshot.versions ? { versions: snapshot.versions } : {}),
        ...(assetCommand ? { assetCommand } : {}),
    };
}

export async function runCanvasTaskUpdate(
    query: (options: CanvasTaskQueryOptions) => Promise<CanvasTaskSnapshot>,
    expected: { projectId: string; taskId: string },
    options: CanvasTaskUpdateRunnerOptions,
): Promise<CanvasTaskUpdate | undefined> {
    options.signal.throwIfAborted();
    let snapshot: CanvasTaskSnapshot;
    try {
        snapshot = await query({ projectId: expected.projectId, signal: options.signal });
    } catch (error) {
        if (!options.signal.aborted && options.isCurrent && !options.isCurrent()) return undefined;
        throw error;
    }
    const update = resolveCanvasTaskUpdate(snapshot, { ...expected, signal: options.signal });
    options.signal.throwIfAborted();
    return options.isCurrent && !options.isCurrent() ? undefined : update;
}

export type CanvasTaskPollingOptions = {
    intervalMs: number;
    wait: (intervalMs: number, signal?: AbortSignal) => Promise<void>;
    projectId?: string;
    signal?: AbortSignal;
    onSnapshot?: (snapshot: CanvasTaskSnapshot) => void;
};

export async function queryCanvasTask(tasks: CanvasTaskApi, results: CanvasTaskResultApi, taskId: string, options: CanvasTaskQueryOptions | AbortSignal = {}): Promise<CanvasTaskSnapshot> {
    const { projectId, signal } = "aborted" in options ? { signal: options } : options;
    signal?.throwIfAborted();
    const task = await tasks.getTask(taskId, signal);
    signal?.throwIfAborted();
    if (task.taskId !== taskId) throw new Error("任务响应与请求不匹配");
    assertCanvasTaskProject({ task }, projectId || task.projectId);
    if (task.status !== "SUCCEEDED") return { task };
    if (!task.resultAssetId || !task.versionId) throw new Error("成功任务缺少结果素材或版本 ID");

    const [assets, versions] = await Promise.all([results.listAssets(task.projectId, signal), results.listVersions(task.projectId, signal)]);
    signal?.throwIfAborted();
    const resultAsset = assets.find((asset) => asset.assetId === task.resultAssetId);
    const resultVersion = versions.find((version) => version.versionId === task.versionId);
    if (!resultAsset || resultVersion?.resultAssetId !== task.resultAssetId) throw new Error("任务成功但结果素材或版本不一致");
    return assertCanvasTaskProject({ task, assets, versions, resultAsset }, task.projectId);
}

export async function pollCanvasTask(tasks: CanvasTaskApi, results: CanvasTaskResultApi, taskId: string, options: CanvasTaskPollingOptions): Promise<CanvasTaskSnapshot> {
    if (!Number.isFinite(options.intervalMs) || options.intervalMs < 0) throw new Error("任务轮询间隔无效");
    while (true) {
        options.signal?.throwIfAborted();
        const snapshot = await queryCanvasTask(tasks, results, taskId, options);
        options.signal?.throwIfAborted();
        options.onSnapshot?.(snapshot);
        if (snapshot.task.status === "SUCCEEDED" || snapshot.task.status === "FAILED") return snapshot;
        await options.wait(options.intervalMs, options.signal);
    }
}
