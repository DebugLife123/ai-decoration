import { importCanvasAudio, importCanvasImage, importCanvasVideo } from "../../../features/canvas/asset-import";
import { createProjectAssetLibrary } from "../../../features/canvas/asset-library";
import type { CanvasTaskStatus, SubmitCanvasTask, SubmitCanvasTaskOptions } from "../../../features/canvas/contracts";
import type { CanvasTaskPollingOptions, CanvasTaskQueryOptions, CanvasTaskUpdateRunnerOptions } from "./task-workflow";
import type { MockCanvasAdapter } from "./mock-adapter";

export function createMockCanvasWorkflow(adapter: MockCanvasAdapter) {
    const tasks = adapter.hostAdapters.taskExecution!;
    return {
        loadProject(projectId: string, signal?: AbortSignal) {
            signal?.throwIfAborted();
            return Promise.all([adapter.hostAdapters.assets!.listAssets(projectId, signal), adapter.hostAdapters.results!.listVersions(projectId, signal)]).then(([assets, versions]) => ({ assets, versions, tasks: adapter.listTasks(projectId) }));
        },
        createProject(name: string) {
            return adapter.api.createProject(name);
        },
        importImage(projectId: string, file: File, signal?: AbortSignal) {
            return importCanvasImage(adapter.hostAdapters.uploads || adapter.hostAdapters.assets!, projectId, file, adapter.uploadBinary, signal);
        },
        importVideo(projectId: string, file: File, signal?: AbortSignal) {
            return importCanvasVideo(adapter.hostAdapters.uploads!, projectId, file, signal);
        },
        importAudio(projectId: string, file: File, signal?: AbortSignal) {
            return importCanvasAudio(adapter.hostAdapters.uploads!, projectId, file, signal);
        },
        submitTask(input: SubmitCanvasTask, options: SubmitCanvasTaskOptions = {}) {
            return tasks.submit(input, options);
        },
        advanceTask(taskId: string, status: Exclude<CanvasTaskStatus, "QUEUED">) {
            return adapter.advanceTask(taskId, status);
        },
        queryTask(taskId: string, options?: CanvasTaskQueryOptions | AbortSignal) {
            return tasks.query(taskId, options);
        },
        updateTask(taskId: string, expected: { projectId: string; taskId: string }, options: CanvasTaskUpdateRunnerOptions) {
            return tasks.update(taskId, expected, options);
        },
        pollTask(taskId: string, options: CanvasTaskPollingOptions) {
            return tasks.poll(taskId, options);
        },
        createAssetLibrary(projectId: string) {
            return createProjectAssetLibrary(adapter.api, projectId);
        },
    };
}
