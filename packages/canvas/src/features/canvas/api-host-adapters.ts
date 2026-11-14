import type { CanvasApi, CanvasAssetApi, CanvasAssetUploadAdapter, CanvasTaskApi, CanvasTaskResultApi } from "./contracts";
import { createCanvasApiMediaAdapter, type CanvasMediaAdapter } from "./media";
import { createApiCanvasProjectHost, createApiCanvasVersionHost, type CanvasProjectHost, type CanvasVersionHost } from "./project-host";
import { createCanvasTaskExecution, type CanvasTaskExecution } from "../../services/api/canvas/task-workflow";

export type CanvasHostAdapterBundle = {
    api?: CanvasApi;
    assets?: CanvasAssetApi;
    uploads?: CanvasAssetUploadAdapter;
    tasks?: CanvasTaskApi;
    results?: CanvasTaskResultApi;
    taskExecution?: CanvasTaskExecution;
    projects: CanvasProjectHost;
    versions: CanvasVersionHost;
    media: CanvasMediaAdapter;
};

export function createApiCanvasHostAdapters(api: CanvasApi, options: { uploadBinary?: CanvasAssetUploadAdapter["uploadBinary"] } = {}): CanvasHostAdapterBundle & { api: CanvasApi } {
    const uploads = options.uploadBinary ? { ...api, uploadBinary: options.uploadBinary } : undefined;
    return {
        api,
        assets: api,
        ...(uploads ? { uploads } : {}),
        tasks: api,
        results: api,
        taskExecution: createCanvasTaskExecution(api, api),
        projects: createApiCanvasProjectHost(api),
        versions: createApiCanvasVersionHost(api),
        media: createCanvasApiMediaAdapter(api),
    };
}
