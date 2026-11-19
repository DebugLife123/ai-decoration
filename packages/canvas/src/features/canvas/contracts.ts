import type { CanvasBackgroundMode } from "../../lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../../types/canvas";

export type CanvasTaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type CanvasApiErrorDto = { code: string; message: string; details?: Record<string, unknown> };
export type CanvasApiResponse<T> = { code: string; message: string; data: T; timestamp?: string };

export class CanvasApiError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown>;

    constructor(code: string, message: string, details?: Record<string, unknown>) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = "CanvasApiError";
    }

    toDto(): CanvasApiErrorDto {
        return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
    }
}

export type AcceptedCanvasTask = { status: 202; taskId: string };

export type CanvasProjectInfo = {
    projectId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
};

export type CanvasProjectDocument = {
    projectId: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    currentVersionId: string | null;
};

export type CanvasAssetBase = {
    assetId: string;
    projectId: string;
    name: string;
    mimeType: string;
    url: string;
    createdAt: string;
    storageRef?: CanvasStorageReference;
};

export type CanvasImageAsset = CanvasAssetBase & {
    kind: "IMAGE";
    width: number;
    height: number;
};

export type CanvasVideoAsset = CanvasAssetBase & {
    kind: "VIDEO";
    width: number;
    height: number;
    durationMs?: number;
};

export type CanvasAudioAsset = CanvasAssetBase & {
    kind: "AUDIO";
    durationMs?: number;
};

/** @deprecated Use CanvasImageAsset when an image-only contract is required. */
export type CanvasAsset = CanvasImageAsset;
export type CanvasProjectAsset = CanvasImageAsset | CanvasVideoAsset | CanvasAudioAsset;

export type CanvasStorageReference = { kind: "OBJECT_STORAGE"; key: string; mimeType: string; bytes?: number };

export type CreateCanvasUploadTicket = {
    projectId: string;
    name: string;
    mimeType: string;
    bytes?: number;
};

export type CanvasUploadTicket = {
    uploadId: string;
    projectId: string;
    method: "PUT";
    uploadUrl: string;
    headers: Record<string, string>;
};

export type CompleteCanvasUpload = {
    projectId: string;
    uploadId: string;
};

export type CancelCanvasUpload = CompleteCanvasUpload;

type RegisterCanvasAssetBase = {
    projectId: string;
    uploadId: string;
    name: string;
    mimeType: string;
};

export type RegisterCanvasAsset = RegisterCanvasAssetBase & (
    | {
        kind: "IMAGE";
        width: number;
        height: number;
    }
    | {
        kind: "VIDEO";
        width: number;
        height: number;
        durationMs?: number;
    }
    | {
        kind: "AUDIO";
        durationMs?: number;
    }
);

export type CanvasVersion = {
    versionId: string;
    projectId: string;
    parentVersionId?: string | null;
    sourceAssetId: string | null;
    resultAssetId: string | null;
    createdAt: string;
    name: string;
};

export type CanvasVersionDocument = {
    versionId: string;
    projectId: string;
    parentVersionId?: string | null;
    sourceAssetId?: string | null;
    resultAssetId?: string | null;
    title: string;
    createdAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

export type CanvasTask = {
    taskId: string;
    projectId: string;
    type: "GENERATE" | "EDIT";
    status: CanvasTaskStatus;
    sourceAssetId: string | null;
    sourceVersionId: string | null;
    resultAssetId: string | null;
    versionId: string | null;
    error: CanvasApiErrorDto | null;
    createdAt: string;
    updatedAt: string;
};

export function getCanvasTaskStateViolation(task: Pick<CanvasTask, "status" | "resultAssetId" | "versionId" | "error">): string | undefined {
    const hasResultAsset = typeof task.resultAssetId === "string" && task.resultAssetId.length > 0;
    const hasVersion = typeof task.versionId === "string" && task.versionId.length > 0;
    if (task.status === "SUCCEEDED" && (!hasResultAsset || !hasVersion || task.error !== null)) return "SUCCEEDED task requires resultAssetId and versionId and cannot contain error";
    if (task.status === "FAILED" && (task.error === null || task.resultAssetId !== null || task.versionId !== null)) return "FAILED task requires error and cannot contain result identities";
    if ((task.status === "QUEUED" || task.status === "RUNNING") && (task.error !== null || task.resultAssetId !== null || task.versionId !== null)) return "Non-terminal task cannot contain error or result identities";
    return undefined;
}

export type SubmitCanvasTask = {
    projectId: string;
    type: "GENERATE" | "EDIT";
    editIntent?: "edit" | "fill";
    prompt: string;
    sourceAssetId?: string;
    sourceVersionId?: string;
    referenceAssetIds?: string[];
    image?: { model: string; quality: string; size: string; background: string };
};

export type SubmitCanvasTaskOptions = { simulateFailure?: boolean; signal?: AbortSignal };

export type UploadCanvasAsset = Pick<CanvasAsset, "projectId" | "name" | "mimeType" | "url" | "width" | "height">;

// Browser import result; storageKey belongs to the legacy local adapter, not HTTP DTOs.
export type CanvasImportedImage = CanvasImageAsset & { bytes: number; storageKey?: string };
export type CanvasImageImporter = (projectId: string, file: File, signal?: AbortSignal) => Promise<CanvasImportedImage>;
export type CanvasImportedVideo = CanvasVideoAsset & { bytes: number; storageKey?: string };
export type CanvasVideoImporter = (projectId: string, file: File, signal?: AbortSignal) => Promise<CanvasImportedVideo>;
export type CanvasImportedAudio = CanvasAudioAsset & { bytes: number; storageKey?: string };
export type CanvasAudioImporter = (projectId: string, file: File, signal?: AbortSignal) => Promise<CanvasImportedAudio>;

export type CanvasDocumentApi = {
    getProjectDocument(projectId: string, signal?: AbortSignal): Promise<CanvasProjectDocument>;
    saveProjectDocument(projectId: string, document: CanvasProjectDocument): Promise<void>;
    saveProjectVersion(projectId: string, version: Omit<CanvasVersionDocument, "versionId" | "projectId">): Promise<CanvasVersionDocument>;
    getProjectVersion(projectId: string, versionId: string, signal?: AbortSignal): Promise<CanvasVersionDocument>;
    deleteProjectVersion(projectId: string, versionId: string): Promise<void>;
};

export type CanvasAssetContentApi = {
    getAsset(projectId: string, assetId: string): Promise<CanvasProjectAsset>;
    readAssetContent(projectId: string, assetId: string, signal?: AbortSignal): Promise<Blob>;
};

export type CanvasApi = CanvasDocumentApi & CanvasAssetContentApi & {
    createProject(name: string): Promise<CanvasProjectInfo>;
    listProjects(signal?: AbortSignal): Promise<CanvasProjectInfo[]>;
    getProject(projectId: string): Promise<CanvasProjectInfo>;
    renameProject(projectId: string, name: string): Promise<void>;
    deleteProject(projectId: string): Promise<void>;
    listAssets(projectId: string, signal?: AbortSignal): Promise<CanvasProjectAsset[]>;
    uploadAsset(input: UploadCanvasAsset): Promise<CanvasAsset>;
    createUploadTicket(input: CreateCanvasUploadTicket): Promise<CanvasUploadTicket>;
    completeUpload(input: CompleteCanvasUpload): Promise<CanvasStorageReference>;
    cancelUpload(input: CancelCanvasUpload): Promise<void>;
    registerAsset(input: RegisterCanvasAsset): Promise<CanvasProjectAsset>;
    deleteAsset(projectId: string, assetId: string): Promise<void>;
    submitTask(input: SubmitCanvasTask, options?: SubmitCanvasTaskOptions): Promise<AcceptedCanvasTask>;
    getTask(taskId: string, signal?: AbortSignal): Promise<CanvasTask>;
    listVersions(projectId: string, signal?: AbortSignal): Promise<CanvasVersion[]>;
};

// Task orchestration is kept as a replaceable boundary so a host can migrate
// from the in-memory Mock to a Spring Boot task service without changing the editor.
export type CanvasTaskApi = Pick<CanvasApi, "submitTask" | "getTask">;
export type CanvasTaskResultApi = Pick<CanvasApi, "listAssets" | "listVersions">;
export type CanvasAssetApi = Pick<CanvasApi, "listAssets" | "getAsset" | "readAssetContent" | "uploadAsset" | "createUploadTicket" | "completeUpload" | "cancelUpload" | "registerAsset" | "deleteAsset">;
// Read-only catalog view keeps asset browsing separate from upload/task orchestration.
export type CanvasAssetCatalogApi = Pick<CanvasAssetApi, "listAssets" | "getAsset">;
export type CanvasAssetUploadAdapter = CanvasAssetApi & { uploadBinary(ticket: CanvasUploadTicket, file: File, signal?: AbortSignal): Promise<void> };

export type CanvasEditorAssetCommand = {
    requestId: string;
    asset: CanvasProjectAsset;
    taskId?: string;
    versionId?: string;
    targetNodeId?: string;
    position?: { x: number; y: number };
};
