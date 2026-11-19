import { importCanvasAudio, importCanvasImage, importCanvasVideo } from "../../../features/canvas/asset-import";
import { createProjectAssetLibrary } from "../../../features/canvas/asset-library";
import type { CanvasTask, SubmitCanvasTask, SubmitCanvasTaskOptions } from "../../../features/canvas/contracts";
import type { CanvasTaskPollingOptions, CanvasTaskQueryOptions, CanvasTaskUpdateRunnerOptions } from "./task-workflow";
import type { CanvasHttpAdapterOptions } from "./http-adapter";
import { createCanvasHttpHostAdapters } from "./http-host-adapters";

export type CanvasHttpWorkflowOptions = CanvasHttpAdapterOptions & {
    /** Load task history from a host-specific endpoint without assuming a route shape. */
    listTasks?: (projectId: string, signal?: AbortSignal) => Promise<CanvasTask[]>;
};

/** HTTP host facade matching the Mock workflow surface. */
export function createCanvasHttpWorkflow(options: CanvasHttpWorkflowOptions) {
    const adapters = createCanvasHttpHostAdapters(options);
    const tasks = adapters.taskExecution!;

    return {
        api: adapters.api,
        hostAdapters: adapters,
        loadProject(projectId: string, signal?: AbortSignal) {
            signal?.throwIfAborted();
            return Promise.all([
                adapters.assets!.listAssets(projectId, signal),
                adapters.results!.listVersions(projectId, signal),
                options.listTasks ? options.listTasks(projectId, signal) : Promise.resolve<CanvasTask[]>([]),
            ]).then(([assets, versions, tasks]) => ({ assets, versions, tasks }));
        },
        createProject(name: string) {
            return adapters.api.createProject(name);
        },
        importImage(projectId: string, file: File, signal?: AbortSignal) {
            return importCanvasImage(adapters.uploads!, projectId, file, adapters.uploads!.uploadBinary, signal);
        },
        importVideo(projectId: string, file: File, signal?: AbortSignal) {
            return importCanvasVideo(adapters.uploads!, projectId, file, signal);
        },
        importAudio(projectId: string, file: File, signal?: AbortSignal) {
            return importCanvasAudio(adapters.uploads!, projectId, file, signal);
        },
        submitTask(input: SubmitCanvasTask, submitOptions: SubmitCanvasTaskOptions = {}) {
            return tasks.submit(input, submitOptions);
        },
        queryTask(taskId: string, queryOptions?: CanvasTaskQueryOptions | AbortSignal) {
            return tasks.query(taskId, queryOptions);
        },
        updateTask(taskId: string, expected: { projectId: string; taskId: string }, updateOptions: CanvasTaskUpdateRunnerOptions) {
            return tasks.update(taskId, expected, updateOptions);
        },
        pollTask(taskId: string, pollingOptions: CanvasTaskPollingOptions) {
            return tasks.poll(taskId, pollingOptions);
        },
        createAssetLibrary(projectId: string) {
            return createProjectAssetLibrary(adapters.api, projectId);
        },
    };
}
