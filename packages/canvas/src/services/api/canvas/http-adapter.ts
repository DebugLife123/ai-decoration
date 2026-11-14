import { CanvasApiError, getCanvasTaskStateViolation, type CanvasApi, type CanvasApiErrorDto, type CanvasApiResponse, type CanvasAsset, type CanvasProjectAsset, type CanvasProjectDocument, type CanvasProjectInfo, type CanvasTask, type CanvasVersion, type CanvasVersionDocument, type SubmitCanvasTask, type AcceptedCanvasTask, type CanvasStorageReference, type CanvasUploadTicket } from "../../../features/canvas/contracts";
import type { CanvasBinaryUploader } from "../../../features/canvas/asset-import";

export type CanvasHttpTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type CanvasHttpHeaders = Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
export type CanvasHttpResponseEnvelope = "raw" | "data";
export type CanvasHttpTaskSubmission = {
    path: string;
    body: unknown;
    expectedStatus?: number;
    mapResponse?: (payload: unknown, input: SubmitCanvasTask) => AcceptedCanvasTask;
};

export type CanvasHttpAdapterOptions = {
    baseUrl: string;
    fetch?: CanvasHttpTransport;
    headers?: CanvasHttpHeaders;
    responseEnvelope?: CanvasHttpResponseEnvelope;
    taskSubmission?: (input: SubmitCanvasTask) => CanvasHttpTaskSubmission;
};

export function createCanvasHttpBinaryUploader(transport: CanvasHttpTransport = fetch): CanvasBinaryUploader {
    return async (ticket, file, signal) => {
        let response: Response;
        signal?.throwIfAborted();
        try {
            const init: RequestInit = { method: ticket.method, headers: ticket.headers, body: file };
            if (signal) init.signal = signal;
            response = await transport(ticket.uploadUrl, init);
        } catch (error) {
            if (signal?.aborted) throw error;
            throw new CanvasApiError("UPLOAD_NETWORK_ERROR", error instanceof Error ? error.message : "素材上传网络请求失败");
        }
        if (!response.ok) throw new CanvasApiError(`UPLOAD_HTTP_${response.status}`, `素材上传失败（HTTP ${response.status}）`, { status: response.status, uploadId: ticket.uploadId });
    };
}

function joinUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function errorFromResponse(status: number, statusText: string, payload: unknown): CanvasApiError {
    if (payload && typeof payload === "object" && "code" in payload && "message" in payload && typeof payload.code === "string" && typeof payload.message === "string") {
        const details = "details" in payload && payload.details && typeof payload.details === "object" && !Array.isArray(payload.details) ? payload.details as Record<string, unknown> : undefined;
        return new CanvasApiError(payload.code, payload.message, details);
    }
    const message = statusText || `画布 API 请求失败（HTTP ${status}）`;
    return new CanvasApiError(`HTTP_${status}`, message, { status, ...(payload === undefined ? {} : { response: payload }) });
}

function invalidResponse(expected: string): never {
    throw new CanvasApiError("INVALID_RESPONSE", `画布 API 响应格式无效：${expected}`);
}

function record(value: unknown, expected: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalidResponse(expected);
    return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, field: string, expected: string) {
    if (typeof value[field] !== "string" || !value[field]) return invalidResponse(`${expected}.${field}`);
}

function nullableStringField(value: Record<string, unknown>, field: string, expected: string) {
    if (value[field] !== null && typeof value[field] !== "string") return invalidResponse(`${expected}.${field}`);
}

function validateProject(value: unknown, projectId?: string): CanvasProjectInfo {
    const item = record(value, "project");
    stringField(item, "projectId", "project");
    stringField(item, "name", "project");
    stringField(item, "createdAt", "project");
    stringField(item, "updatedAt", "project");
    if (projectId && item.projectId !== projectId) return invalidResponse("project.projectId 与请求不匹配");
    return item as CanvasProjectInfo;
}

function validateAsset(value: unknown, projectId?: string, assetId?: string): CanvasProjectAsset {
    const item = record(value, "asset");
    stringField(item, "assetId", "asset");
    stringField(item, "projectId", "asset");
    stringField(item, "name", "asset");
    stringField(item, "mimeType", "asset");
    stringField(item, "url", "asset");
    stringField(item, "createdAt", "asset");
    if (item.kind !== "IMAGE" && item.kind !== "VIDEO" && item.kind !== "AUDIO") return invalidResponse("asset.kind");
    if (item.kind !== "AUDIO" && (typeof item.width !== "number" || !Number.isFinite(item.width) || item.width <= 0 || typeof item.height !== "number" || !Number.isFinite(item.height) || item.height <= 0)) return invalidResponse("asset dimensions");
    if ((item.kind === "VIDEO" || item.kind === "AUDIO") && item.durationMs !== undefined && (typeof item.durationMs !== "number" || !Number.isFinite(item.durationMs) || item.durationMs < 0)) return invalidResponse("asset.durationMs");
    if (item.storageRef !== undefined) {
        const storageRef = record(item.storageRef, "asset.storageRef");
        stringField(storageRef, "key", "asset.storageRef");
        if (storageRef.kind !== "OBJECT_STORAGE" || typeof storageRef.mimeType !== "string" || !storageRef.mimeType || (storageRef.bytes !== undefined && (typeof storageRef.bytes !== "number" || !Number.isFinite(storageRef.bytes) || storageRef.bytes < 0))) return invalidResponse("asset.storageRef");
    }
    if (projectId && item.projectId !== projectId) return invalidResponse("asset.projectId 与请求不匹配");
    if (assetId && item.assetId !== assetId) return invalidResponse("asset.assetId 与请求不匹配");
    return item as CanvasProjectAsset;
}

function validateImageAsset(value: unknown, projectId?: string, assetId?: string): CanvasAsset {
    const asset = validateAsset(value, projectId, assetId);
    if (asset.kind !== "IMAGE") return invalidResponse("asset.kind IMAGE");
    return asset;
}

function validateStorageReference(value: unknown): CanvasStorageReference {
    const item = record(value, "storageRef");
    if (item.kind !== "OBJECT_STORAGE") return invalidResponse("storageRef.kind");
    stringField(item, "key", "storageRef");
    stringField(item, "mimeType", "storageRef");
    if (item.bytes !== undefined && (typeof item.bytes !== "number" || !Number.isFinite(item.bytes) || item.bytes < 0)) return invalidResponse("storageRef.bytes");
    return item as CanvasStorageReference;
}

function validateUploadTicket(value: unknown, projectId: string): CanvasUploadTicket {
    const item = record(value, "uploadTicket");
    stringField(item, "uploadId", "uploadTicket");
    stringField(item, "projectId", "uploadTicket");
    if (item.projectId !== projectId) return invalidResponse("uploadTicket.projectId 与请求不匹配");
    if (item.method !== "PUT") return invalidResponse("uploadTicket.method");
    stringField(item, "uploadUrl", "uploadTicket");
    const headers = record(item.headers, "uploadTicket.headers");
    if (Object.values(headers).some((header) => typeof header !== "string")) return invalidResponse("uploadTicket.headers");
    return item as CanvasUploadTicket;
}

function validateErrorDto(value: unknown, expected: string): CanvasApiErrorDto {
    const item = record(value, expected);
    stringField(item, "code", expected);
    stringField(item, "message", expected);
    if (item.details !== undefined && (!item.details || typeof item.details !== "object" || Array.isArray(item.details))) return invalidResponse(`${expected}.details`);
    return item as CanvasApiErrorDto;
}

function validateTask(value: unknown, taskId?: string): CanvasTask {
    const item = record(value, "task");
    stringField(item, "taskId", "task");
    stringField(item, "projectId", "task");
    stringField(item, "createdAt", "task");
    stringField(item, "updatedAt", "task");
    if (item.type !== "GENERATE" && item.type !== "EDIT") return invalidResponse("task.type");
    if (!["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"].includes(String(item.status))) return invalidResponse("task.status");
    for (const field of ["sourceAssetId", "sourceVersionId", "resultAssetId", "versionId"]) nullableStringField(item, field, "task");
    if (item.error !== null) validateErrorDto(item.error, "task.error");
    if (taskId && item.taskId !== taskId) return invalidResponse("task.taskId 与请求不匹配");
    const violation = getCanvasTaskStateViolation(item as unknown as CanvasTask);
    if (violation) return invalidResponse(violation);
    return item as CanvasTask;
}

function validateVersion(value: unknown, projectId?: string): CanvasVersion {
    const item = record(value, "version");
    stringField(item, "versionId", "version");
    stringField(item, "projectId", "version");
    nullableStringField(item, "resultAssetId", "version");
    stringField(item, "createdAt", "version");
    stringField(item, "name", "version");
    nullableStringField(item, "sourceAssetId", "version");
    if (projectId && item.projectId !== projectId) return invalidResponse("version.projectId 与请求不匹配");
    return item as CanvasVersion;
}

function validateProjectDocument(value: unknown, projectId: string): CanvasProjectDocument {
    const item = record(value, "projectDocument");
    if (item.projectId !== projectId) return invalidResponse("projectDocument.projectId 与请求不匹配");
    if (!Array.isArray(item.nodes) || !Array.isArray(item.connections) || !Array.isArray(item.chatSessions)) return invalidResponse("projectDocument");
    if (item.activeChatId !== null && typeof item.activeChatId !== "string") return invalidResponse("projectDocument.activeChatId");
    if (item.backgroundMode !== "dots" && item.backgroundMode !== "lines" && item.backgroundMode !== "blank") return invalidResponse("projectDocument.backgroundMode");
    if (typeof item.showImageInfo !== "boolean") return invalidResponse("projectDocument.showImageInfo");
    nullableStringField(item, "currentVersionId", "projectDocument");
    const viewport = record(item.viewport, "projectDocument.viewport");
    if (!["x", "y", "k"].every((key) => typeof viewport[key] === "number" && Number.isFinite(viewport[key]))) return invalidResponse("projectDocument.viewport");
    return item as CanvasProjectDocument;
}

function validateVersionDocument(value: unknown, projectId: string, versionId?: string): CanvasVersionDocument {
    const item = record(value, "versionDocument");
    stringField(item, "versionId", "versionDocument");
    if (item.projectId !== projectId) return invalidResponse("versionDocument.projectId 与请求不匹配");
    if (versionId && item.versionId !== versionId) return invalidResponse("versionDocument.versionId 与请求不匹配");
    for (const field of ["sourceAssetId", "resultAssetId"]) if (field in item) nullableStringField(item, field, "versionDocument");
    stringField(item, "title", "versionDocument");
    stringField(item, "createdAt", "versionDocument");
    if (!Array.isArray(item.nodes) || !Array.isArray(item.connections)) return invalidResponse("versionDocument");
    if (item.backgroundMode !== "dots" && item.backgroundMode !== "lines" && item.backgroundMode !== "blank") return invalidResponse("versionDocument.backgroundMode");
    if (typeof item.showImageInfo !== "boolean") return invalidResponse("versionDocument.showImageInfo");
    const viewport = record(item.viewport, "versionDocument.viewport");
    if (!["x", "y", "k"].every((key) => typeof viewport[key] === "number" && Number.isFinite(viewport[key]))) return invalidResponse("versionDocument.viewport");
    return item as CanvasVersionDocument;
}

function validateAcceptedTask(value: unknown): AcceptedCanvasTask {
    const item = record(value, "acceptedTask");
    if (item.status !== 202 || typeof item.taskId !== "string" || !item.taskId) return invalidResponse("acceptedTask");
    return item as AcceptedCanvasTask;
}

function validateList<T>(value: unknown, expected: string, validate: (item: unknown) => T): T[] {
    if (!Array.isArray(value)) return invalidResponse(expected);
    return value.map(validate);
}

async function readPayload(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (!text) return undefined;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function unwrapResponseEnvelope(payload: unknown, mode: CanvasHttpResponseEnvelope): unknown {
    if (mode !== "data" || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
    const envelope = payload as Partial<CanvasApiResponse<unknown>>;
    if (typeof envelope.code !== "string" || typeof envelope.message !== "string" || !Object.prototype.hasOwnProperty.call(envelope, "data")) return payload;
    return envelope.data;
}

export function createCanvasHttpAdapter(options: CanvasHttpAdapterOptions): CanvasApi {
    const transport = options.fetch || fetch;
    const responseEnvelope = options.responseEnvelope || "raw";
    const resolveHeaders = async () => typeof options.headers === "function" ? options.headers() : options.headers;
    const request = async <T>(path: string, init: RequestInit, expectedStatus: number): Promise<T> => {
        let response: Response;
        const headers = new Headers({ Accept: "application/json", ...(await resolveHeaders()) });
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
        try {
            response = await transport(joinUrl(options.baseUrl, path), {
                ...init,
                headers,
            });
        } catch (error) {
            if (init.signal?.aborted) throw error;
            throw new CanvasApiError("NETWORK_ERROR", error instanceof Error ? error.message : "画布 API 网络请求失败");
        }
        const payload = await readPayload(response);
        if (response.status !== expectedStatus) throw errorFromResponse(response.status, response.statusText, payload);
        const body = unwrapResponseEnvelope(payload, responseEnvelope);
        if (expectedStatus !== 204 && (body === undefined || typeof body === "string")) throw new CanvasApiError("INVALID_RESPONSE", "画布 API 返回了空响应或非 JSON 内容", { status: response.status });
        return body as T;
    };
    const requestBlob = async (path: string, signal?: AbortSignal): Promise<Blob> => {
        let response: Response;
        const headers = new Headers({ Accept: "application/octet-stream", ...(await resolveHeaders()) });
        try {
            response = await transport(joinUrl(options.baseUrl, path), { method: "GET", headers, signal });
        } catch (error) {
            if (signal?.aborted) throw error;
            throw new CanvasApiError("NETWORK_ERROR", error instanceof Error ? error.message : "画布 API 网络请求失败");
        }
        if (response.status !== 200) throw errorFromResponse(response.status, response.statusText, await readPayload(response));
        return response.blob();
    };
    const getProject = async (projectId: string) => validateProject(await request<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}`, { method: "GET" }, 200), projectId);
    const getProjectDocument = async (projectId: string, signal?: AbortSignal) => validateProjectDocument(await request<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/document`, { method: "GET", signal }, 200), projectId);
    const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
    return {
        createProject: async (name) => validateProject(await request<unknown>("/api/v1/projects", json({ name }), 201)),
        listProjects: async (signal) => validateList(await request<unknown>("/api/v1/projects", { method: "GET", signal }, 200), "projects", (item) => validateProject(item)),
        getProject,
        renameProject: async (projectId, name) => { await request<void>(`/api/v1/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: JSON.stringify({ name }) }, 204); },
        deleteProject: async (projectId) => { await request<void>(`/api/v1/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }, 204); },
        getProjectDocument,
        saveProjectDocument: async (projectId, document) => {
            if (projectId !== document.projectId) throw new CanvasApiError("PROJECT_ID_MISMATCH", "画布文档 projectId 不匹配");
            await request<void>(`/api/v1/projects/${encodeURIComponent(projectId)}/document`, { method: "PUT", body: JSON.stringify(document) }, 204);
        },
        listAssets: async (projectId, signal) => validateList(await request<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/assets`, { method: "GET", signal }, 200), "assets", (item) => validateAsset(item, projectId)),
        getAsset: async (projectId, assetId) => validateAsset(await request<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, { method: "GET" }, 200), projectId, assetId),
        readAssetContent: (projectId, assetId, signal) => requestBlob(`/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/content`, signal),
        uploadAsset: async (input) => validateImageAsset(await request<unknown>(`/api/v1/projects/${encodeURIComponent(input.projectId)}/assets`, json(input), 201), input.projectId),
        createUploadTicket: async (input) => validateUploadTicket(await request<unknown>(`/api/v1/projects/${encodeURIComponent(input.projectId)}/assets/upload-ticket`, json(input), 201), input.projectId),
        completeUpload: async (input) => validateStorageReference(await request<unknown>(`/api/v1/projects/${encodeURIComponent(input.projectId)}/assets/uploads/${encodeURIComponent(input.uploadId)}/complete`, json({ uploadId: input.uploadId }), 200)),
        cancelUpload: (input) => request<void>(`/api/v1/projects/${encodeURIComponent(input.projectId)}/assets/uploads/${encodeURIComponent(input.uploadId)}`, { method: "DELETE" }, 204),
        registerAsset: async (input) => validateAsset(await request<unknown>(`/api/v1/projects/${encodeURIComponent(input.projectId)}/assets/register`, json(input), 201), input.projectId),
        deleteAsset: (projectId, assetId) => request<void>(`/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" }, 204),
        submitTask: async (input: SubmitCanvasTask, submitOptions) => {
            submitOptions?.signal?.throwIfAborted();
            const submission = options.taskSubmission?.(input) || { path: "/api/v1/tasks", body: input };
            const payload = await request<unknown>(submission.path, { ...json(submission.body), signal: submitOptions?.signal }, submission.expectedStatus ?? 202);
            return validateAcceptedTask(submission.mapResponse ? submission.mapResponse(payload, input) : payload);
        },
        getTask: async (taskId, signal) => validateTask(await request<unknown>(`/api/v1/tasks/${encodeURIComponent(taskId)}`, { method: "GET", signal }, 200), taskId),
        listVersions: async (projectId, signal) => validateList(await request<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/versions`, { method: "GET", signal }, 200), "versions", (item) => validateVersion(item, projectId)),
        saveProjectVersion: async (projectId, version) => validateVersionDocument(await request<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/versions`, json(version), 201), projectId),
        getProjectVersion: async (projectId, versionId, signal) => validateVersionDocument(await request<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`, { method: "GET", signal }, 200), projectId, versionId),
        deleteProjectVersion: (projectId, versionId) => request<void>(`/api/v1/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`, { method: "DELETE" }, 204),
    };
}
