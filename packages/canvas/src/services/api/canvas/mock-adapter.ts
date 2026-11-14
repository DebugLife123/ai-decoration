import { nanoid } from "nanoid";
import { createStore, type StoreApi } from "zustand";

import { CanvasApiError, getCanvasTaskStateViolation, type AcceptedCanvasTask, type CanvasApi, type CanvasAsset, type CanvasProjectAsset, type CanvasProjectInfo, type CanvasTask, type CanvasVersion, type SubmitCanvasTask, type SubmitCanvasTaskOptions, type UploadCanvasAsset, type CreateCanvasUploadTicket, type CanvasUploadTicket, type CompleteCanvasUpload, type RegisterCanvasAsset, type CanvasStorageReference } from "../../../features/canvas/contracts";
import type { CanvasMediaAdapter } from "../../../features/canvas/media";
import type { CanvasHostAdapterBundle } from "../../../features/canvas/api-host-adapters";
import { createCanvasProjectHost, createCanvasVersionHost, type CanvasProjectHost, type CanvasVersionHost } from "../../../features/canvas/project-host";
import { fitCanvasAssetNodeSize } from "../../../lib/canvas/canvas-node-size";
import { createCanvasState, type CanvasProject, type CanvasStore } from "../../../stores/canvas/canvas-state";
import { CanvasNodeType, type CanvasNodeData } from "../../../types/canvas";
import { resolveMockTaskTransition } from "../../../features/canvas/mock-task-state";
import { isCanvasAssetReferencedByAssistantSessions, isCanvasAssetReferencedByNodes } from "../../../features/canvas/asset-metadata";
import { createCanvasTaskExecution } from "./task-workflow";

export type MockTask = CanvasTask & { pollCount: number; simulateFailure: boolean };

export type MockTaskProgression = "poll" | "manual";

export type MockCanvasOptions = {
    projectName?: string;
    sampleAsset: Omit<UploadCanvasAsset, "projectId">;
    taskProgression?: MockTaskProgression;
    persistence?: CanvasMockPersistence;
};

export type CanvasMockPersistenceSnapshot = {
    projects: CanvasProject[];
    deletedProjects: CanvasStore["deletedProjects"];
    assets: CanvasProjectAsset[];
    assetContents: Array<{ assetId: string; blob: Blob }>;
    versions: CanvasVersion[];
    tasks: MockTask[];
};

export type CanvasMockPersistence = {
    load(): Promise<CanvasMockPersistenceSnapshot | null>;
    save(snapshot: CanvasMockPersistenceSnapshot): Promise<void>;
};

export type MockCanvasAdapter = {
    api: CanvasApi & {
        submitTask(input: SubmitCanvasTask, options?: SubmitCanvasTaskOptions): Promise<AcceptedCanvasTask>;
    };
    projects: StoreApi<CanvasStore>;
    projectHost: CanvasProjectHost;
    versionHost: CanvasVersionHost;
    hostAdapters: CanvasHostAdapterBundle & { api: CanvasApi };
    initialProjectId: string;
    media: CanvasMediaAdapter;
    uploadBinary(ticket: CanvasUploadTicket, file: File): Promise<void>;
    advanceTask(taskId: string, status: Exclude<CanvasTask["status"], "QUEUED">): CanvasTask;
    listTasks(projectId: string): CanvasTask[];
    failNextDocumentSave(): void;
    ready: Promise<void>;
};

function taskInfo({ pollCount: _pollCount, simulateFailure: _simulateFailure, ...task }: MockTask): CanvasTask {
    const violation = getCanvasTaskStateViolation(task);
    if (violation) throw new CanvasApiError("MOCK_TASK_STATE_INVALID", violation, { taskId: task.taskId, status: task.status });
    return structuredClone(task);
}

function fail(code: string, message: string, details?: Record<string, unknown>): never {
    throw new CanvasApiError(code, message, details);
}

function assetNode(asset: CanvasAsset, index: number, task?: Pick<CanvasTask, "taskId" | "versionId">): CanvasNodeData {
    const size = fitCanvasAssetNodeSize(asset.width, asset.height);
    return {
        id: `asset-${asset.assetId}`,
        type: CanvasNodeType.Image,
        title: asset.name,
        position: { x: index * (size.width + 80), y: 0 },
        width: size.width,
        height: size.height,
        metadata: {
            content: asset.url,
            status: "success",
            mimeType: asset.mimeType,
            naturalWidth: asset.width,
            naturalHeight: asset.height,
            assetId: asset.assetId,
            taskId: task?.taskId,
            versionId: task?.versionId || undefined,
        },
    };
}

export function createMockCanvasAdapter(options: MockCanvasOptions): MockCanvasAdapter {
    const projects = createStore<CanvasStore>()(createCanvasState);
    projects.setState({ hydrated: true });

    const assets = new Map<string, CanvasProjectAsset>();
    const uploads = new Map<string, { ticket: CanvasUploadTicket; bytes?: number; blob?: Blob; storageRef?: CanvasStorageReference }>();
    const assetContent = new Map<string, Blob>();
    const assetObjectUrls = new Map<string, string>();
    const tasks = new Map<string, MockTask>();
    const versions = new Map<string, CanvasVersion>();
    let failNextDocumentSave = false;
    const taskProgression = options.taskProgression || "poll";
    let initialProjectId = projects.getState().createProject(options.projectName || "客厅方案 Mock");
    let restoring = true;
    let persistQueue = Promise.resolve();
    const schedulePersist = () => {
        if (!options.persistence || restoring) return;
        const snapshot: CanvasMockPersistenceSnapshot = {
            projects: structuredClone(projects.getState().projects),
            deletedProjects: structuredClone(projects.getState().deletedProjects),
            assets: structuredClone([...assets.values()]),
            assetContents: [...assetContent.entries()].map(([assetId, blob]) => ({ assetId, blob })),
            versions: structuredClone([...versions.values()]),
            tasks: structuredClone([...tasks.values()]),
        };
        persistQueue = persistQueue.catch(() => undefined).then(() => options.persistence!.save(snapshot));
    };

    const requireProject = (projectId: string) => {
        const project = projects.getState().openProject(projectId);
        if (!project) fail("PROJECT_NOT_FOUND", `项目不存在：${projectId}`);
        return project;
    };
    const requireAsset = (assetId: string) => {
        const asset = assets.get(assetId);
        if (!asset) fail("ASSET_NOT_FOUND", `素材不存在：${assetId}`);
        return { ...asset };
    };
    const projectInfo = (projectId: string): CanvasProjectInfo => {
        const project = requireProject(projectId);
        return { projectId: project.id, name: project.title, createdAt: project.createdAt, updatedAt: project.updatedAt };
    };
    const addAsset = (input: UploadCanvasAsset): CanvasAsset => {
        requireProject(input.projectId);
        const asset: CanvasAsset = { assetId: nanoid(), kind: "IMAGE", createdAt: new Date().toISOString(), ...input };
        assets.set(asset.assetId, asset);
        return asset;
    };

    const sampleAsset = addAsset({ projectId: initialProjectId, ...options.sampleAsset });
    projects.getState().updateProject(initialProjectId, { nodes: [assetNode(sampleAsset, 0)] });
    const restore = async () => {
        const snapshot = await options.persistence?.load();
        if (snapshot?.projects?.length) {
            assets.clear();
            assetContent.clear();
            versions.clear();
            tasks.clear();
            for (const asset of snapshot.assets || []) assets.set(asset.assetId, structuredClone(asset));
            for (const { assetId, blob } of snapshot.assetContents || []) assetContent.set(assetId, blob);
            for (const version of snapshot.versions || []) versions.set(version.versionId, structuredClone(version));
            for (const task of snapshot.tasks || []) tasks.set(task.taskId, structuredClone(task));
            for (const asset of assets.values()) {
                const blob = assetContent.get(asset.assetId);
                if (blob && typeof URL.createObjectURL === "function") {
                    const url = URL.createObjectURL(blob);
                    asset.url = url;
                    assetObjectUrls.set(asset.assetId, url);
                }
            }
            const assetUrls = new Map([...assets.values()].map((asset) => [asset.assetId, asset.url]));
            const restoreNodes = (nodes: CanvasNodeData[]) => nodes.map((node) => {
                const assetId = node.metadata?.assetId;
                const url = assetId ? assetUrls.get(assetId) : undefined;
                const images = node.metadata?.images?.map((image) => {
                    const imageUrl = image.assetId ? assetUrls.get(image.assetId) : undefined;
                    return imageUrl ? { ...image, content: imageUrl } : image;
                });
                return url || images?.some((image, index) => image !== node.metadata?.images?.[index])
                    ? { ...node, metadata: { ...node.metadata, ...(url ? { content: url } : {}), ...(images ? { images } : {}) } }
                    : node;
            });
            const restoredProjects = structuredClone(snapshot.projects).map((project) => ({
                ...project,
                nodes: restoreNodes(project.nodes),
                versions: project.versions.map((version) => ({ ...version, nodes: restoreNodes(version.nodes) })),
            }));
            projects.getState().replaceProjects(restoredProjects, structuredClone(snapshot.deletedProjects || []));
            initialProjectId = restoredProjects[0]?.id || initialProjectId;
        }
        restoring = false;
        schedulePersist();
    };
    const ready = restore();
    projects.subscribe(schedulePersist);
    const projectHost = createCanvasProjectHost(projects, {
        beforeSave() {
            if (!failNextDocumentSave) return;
            failNextDocumentSave = false;
            throw new CanvasApiError("MOCK_PROJECT_SAVE_FAILED", "项目保存失败");
        },
    });
    const versionHost = createCanvasVersionHost(projects);

    const completeTask = (task: MockTask): CanvasTask => {
        if (task.status === "SUCCEEDED") return taskInfo(task);
        const source = task.sourceAssetId ? requireAsset(task.sourceAssetId) : [...assets.values()].find((asset) => asset.projectId === task.projectId && asset.kind === "IMAGE");
        if (!source) fail("MOCK_SOURCE_ASSET_NOT_FOUND", "当前项目没有可用于 Mock 结果的图片素材");
        if (source.kind !== "IMAGE") fail("MOCK_SOURCE_ASSET_INVALID", "Mock 生成和编辑任务只支持图片素材");

        const result = addAsset({
            projectId: task.projectId,
            name: `${task.type === "EDIT" ? "编辑" : "生成"}结果 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
            mimeType: source.mimeType,
            url: source.url,
            width: source.width,
            height: source.height,
        });
        const sourceBlob = assetContent.get(source.assetId);
        if (sourceBlob) {
            assetContent.set(result.assetId, sourceBlob);
            if (typeof URL.createObjectURL === "function") {
                const resultUrl = URL.createObjectURL(sourceBlob);
                result.url = resultUrl;
                assetObjectUrls.set(result.assetId, resultUrl);
                assets.set(result.assetId, result);
            }
        }
        const project = requireProject(task.projectId);
        const resultNode = assetNode(result, project.nodes.length, { taskId: task.taskId, versionId: null });
        const versionId = projects.getState().saveProjectVersion(task.projectId, {
            sourceAssetId: task.sourceAssetId,
            resultAssetId: result.assetId,
            title: task.type === "EDIT" ? "Mock 编辑版本" : "Mock 生成版本",
            createdAt: new Date().toISOString(),
            nodes: [...project.nodes, resultNode],
            connections: project.connections,
            backgroundMode: project.backgroundMode,
            showImageInfo: project.showImageInfo,
            viewport: project.viewport,
        });
        const version: CanvasVersion = {
            versionId,
            projectId: task.projectId,
            sourceAssetId: task.sourceAssetId,
            resultAssetId: result.assetId,
            createdAt: new Date().toISOString(),
            name: task.type === "EDIT" ? "Mock 编辑版本" : "Mock 生成版本",
        };
        versions.set(versionId, version);
        Object.assign(task, { status: "SUCCEEDED", resultAssetId: result.assetId, versionId, updatedAt: new Date().toISOString() });
        schedulePersist();
        return taskInfo(task);
    };

    const advanceTask = (taskId: string, status: Exclude<CanvasTask["status"], "QUEUED">): CanvasTask => {
        const task = tasks.get(taskId);
        if (!task) fail("TASK_NOT_FOUND", `任务不存在：${taskId}`);
        const transition = resolveMockTaskTransition(task.status, status);
        if (transition === "TERMINAL") return taskInfo(task);
        if (!transition) fail("MOCK_TASK_TRANSITION_INVALID", "Mock 任务必须先进入 RUNNING 状态");
        task.updatedAt = new Date().toISOString();
        if (transition === "RUNNING") {
            task.status = "RUNNING";
            schedulePersist();
            return taskInfo(task);
        }
        if (transition === "FAILED") {
            task.status = "FAILED";
            task.error = new CanvasApiError("MOCK_GENERATION_FAILED", "Mock 任务按测试选项返回失败").toDto();
            schedulePersist();
            return taskInfo(task);
        }
        try {
            return completeTask(task);
        } catch (error) {
            task.status = "FAILED";
            task.error = (error instanceof CanvasApiError ? error : new CanvasApiError("MOCK_RESULT_FAILED", error instanceof Error ? error.message : "Mock 结果创建失败")).toDto();
            schedulePersist();
            return taskInfo(task);
        }
    };
    const listTasks = (projectId: string) => [...tasks.values()].filter((task) => task.projectId === projectId).map(taskInfo);

    const api: MockCanvasAdapter["api"] = {
        async createProject(name) {
            const projectId = projects.getState().createProject(name.trim() || "未命名项目");
            return projectInfo(projectId);
        },
        async listProjects(signal) {
            signal?.throwIfAborted();
            const result = projects.getState().projects.map((project) => projectInfo(project.id));
            signal?.throwIfAborted();
            return result;
        },
        async getProject(projectId) {
            return projectInfo(projectId);
        },
        async renameProject(projectId, name) {
            requireProject(projectId);
            projects.getState().renameProject(projectId, name.trim() || "未命名项目");
        },
        async deleteProject(projectId) {
            requireProject(projectId);
            assets.forEach((asset, assetId) => {
                if (asset.projectId !== projectId) return;
                assets.delete(assetId);
                assetContent.delete(assetId);
            });
            [...versions.entries()].forEach(([versionId, version]) => { if (version.projectId === projectId) versions.delete(versionId); });
            projects.getState().deleteProjects([projectId]);
        },
        async getProjectDocument(projectId, signal) {
            signal?.throwIfAborted();
            const document = await projectHost.getDocument(projectId, signal);
            if (!document) fail("PROJECT_NOT_FOUND", `项目不存在：${projectId}`);
            signal?.throwIfAborted();
            return document;
        },
        saveProjectDocument(projectId, document) {
            return projectHost.saveDocument(projectId, document);
        },
        async getProjectVersion(projectId, versionId, signal) {
            signal?.throwIfAborted();
            requireProject(projectId);
            const version = versionHost.getSnapshot(projectId).versions.find((item) => item.versionId === versionId);
            if (!version) fail("VERSION_NOT_FOUND", `版本不存在：${versionId}`);
            signal?.throwIfAborted();
            return structuredClone(version);
        },
        async listAssets(projectId, signal) {
            signal?.throwIfAborted();
            requireProject(projectId);
            return [...assets.values()].filter((asset) => asset.projectId === projectId).map((asset) => ({ ...asset }));
        },
        async getAsset(projectId, assetId) {
            const asset = requireAsset(assetId);
            if (asset.projectId !== projectId) fail("ASSET_PROJECT_MISMATCH", "素材不属于当前项目");
            return asset;
        },
        async deleteAsset(projectId, assetId) {
            const asset = await api.getAsset(projectId, assetId);
            const project = requireProject(projectId);
            const referencedInDocument = isCanvasAssetReferencedByNodes(project.nodes, asset.assetId)
                || isCanvasAssetReferencedByAssistantSessions(project.chatSessions, asset.assetId);
            const referencedInVersion = project.versions.some((version) => version.sourceAssetId === asset.assetId
                || version.resultAssetId === asset.assetId
                || isCanvasAssetReferencedByNodes(version.nodes, asset.assetId));
            const referencedInTask = [...tasks.values()].some((task) => task.projectId === projectId && (task.sourceAssetId === assetId || task.resultAssetId === assetId));
            if (referencedInDocument || referencedInVersion || referencedInTask) fail("ASSET_IN_USE", "素材仍被画布、版本或任务引用，不能删除", { projectId, assetId });
            assets.delete(assetId);
            assetContent.delete(assetId);
            const objectUrl = assetObjectUrls.get(assetId);
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            assetObjectUrls.delete(assetId);
            schedulePersist();
        },
        async readAssetContent(projectId, assetId, signal) {
            signal?.throwIfAborted();
            const asset = await api.getAsset(projectId, assetId);
            const stored = assetContent.get(assetId);
            if (stored) return stored.slice(0, stored.size, stored.type || asset.mimeType);
            if (!asset.url.startsWith("data:")) fail("MOCK_ASSET_CONTENT_NOT_FOUND", "Mock 没有该素材的二进制内容");
            const response = await fetch(asset.url, { signal });
            if (!response.ok) fail("MOCK_ASSET_CONTENT_NOT_FOUND", "Mock 素材内容读取失败");
            return response.blob();
        },
        async uploadAsset(input) {
            return { ...addAsset(input) };
        },
        async createUploadTicket(input: CreateCanvasUploadTicket) {
            requireProject(input.projectId);
            if (!input.name.trim() || !input.mimeType.trim() || (input.bytes !== undefined && (!Number.isFinite(input.bytes) || input.bytes < 0))) fail("INVALID_UPLOAD", "上传文件信息无效");
            const uploadId = nanoid();
            const ticket: CanvasUploadTicket = { uploadId, projectId: input.projectId, method: "PUT", uploadUrl: `mock://uploads/${uploadId}`, headers: { "Content-Type": input.mimeType } };
            uploads.set(uploadId, { ticket, bytes: input.bytes });
            return structuredClone(ticket);
        },
        async completeUpload(input: CompleteCanvasUpload) {
            const upload = uploads.get(input.uploadId);
            if (!upload || upload.ticket.projectId !== input.projectId) fail("UPLOAD_NOT_FOUND", "上传记录不存在或不属于当前项目");
            if (!upload.storageRef) upload.storageRef = { kind: "OBJECT_STORAGE", key: `mock/${input.projectId}/${input.uploadId}`, mimeType: upload.ticket.headers["Content-Type"], bytes: upload.bytes };
            return structuredClone(upload.storageRef);
        },
        async cancelUpload(input) {
            const upload = uploads.get(input.uploadId);
            if (!upload || upload.ticket.projectId !== input.projectId) return;
            uploads.delete(input.uploadId);
        },
        async registerAsset(input: RegisterCanvasAsset) {
            const upload = uploads.get(input.uploadId);
            if (!upload || upload.ticket.projectId !== input.projectId || !upload.storageRef) fail("UPLOAD_NOT_COMPLETED", "素材只能在上传完成后注册");
            const kind = input.kind;
            const dimensions = "width" in input ? { width: input.width, height: input.height } : undefined;
            if (kind !== "AUDIO" && (!dimensions || !Number.isFinite(dimensions.width) || dimensions.width <= 0 || !Number.isFinite(dimensions.height) || dimensions.height <= 0)) fail("INVALID_ASSET_DIMENSIONS", "素材尺寸无效");
            if ("durationMs" in input && input.durationMs !== undefined && (!Number.isFinite(input.durationMs) || input.durationMs < 0)) fail("INVALID_ASSET_DURATION", "素材时长无效");
            const objectUrl = upload.blob && typeof URL.createObjectURL === "function" ? URL.createObjectURL(upload.blob) : undefined;
            const base = {
                assetId: nanoid(), projectId: input.projectId, name: input.name, kind, mimeType: input.mimeType,
                url: objectUrl || upload.storageRef.key,
                createdAt: new Date().toISOString(), storageRef: { ...upload.storageRef },
            } as const;
            const durationMs = "durationMs" in input ? input.durationMs : undefined;
            const asset: CanvasProjectAsset = kind === "AUDIO"
                ? { ...base, kind, durationMs }
                : kind === "VIDEO"
                    ? { ...base, kind, width: dimensions!.width, height: dimensions!.height, durationMs }
                    : { ...base, kind, width: dimensions!.width, height: dimensions!.height };
            assets.set(asset.assetId, asset);
            if (upload.blob) assetContent.set(asset.assetId, upload.blob);
            if (objectUrl) assetObjectUrls.set(asset.assetId, objectUrl);
            uploads.delete(input.uploadId);
            schedulePersist();
            return structuredClone(asset);
        },
        async submitTask(input: SubmitCanvasTask, mockOptions?: SubmitCanvasTaskOptions) {
            mockOptions?.signal?.throwIfAborted();
            requireProject(input.projectId);
            if (!input.prompt.trim()) fail("INVALID_PROMPT", "提示词不能为空");
            if (input.type === "EDIT" && !input.sourceAssetId) fail("EDIT_SOURCE_REQUIRED", "编辑任务需要源素材");
            if (input.sourceAssetId) {
                const source = requireAsset(input.sourceAssetId);
                if (source.projectId !== input.projectId) fail("ASSET_PROJECT_MISMATCH", "源素材不属于当前项目");
                if (source.kind !== "IMAGE") fail("MOCK_SOURCE_ASSET_INVALID", "Mock 生成和编辑任务只支持图片素材");
            }
            for (const assetId of input.referenceAssetIds || []) {
                const reference = requireAsset(assetId);
                if (reference.projectId !== input.projectId) fail("ASSET_PROJECT_MISMATCH", "引用素材不属于当前项目");
                if (reference.kind !== "IMAGE") fail("MOCK_REFERENCE_ASSET_INVALID", "Mock 任务引用只支持图片素材");
            }
            if (input.sourceVersionId && versions.get(input.sourceVersionId)?.projectId !== input.projectId) fail("VERSION_PROJECT_MISMATCH", "源版本不属于当前项目");
            if (input.sourceVersionId && versions.get(input.sourceVersionId)?.resultAssetId !== input.sourceAssetId) fail("SOURCE_VERSION_ASSET_MISMATCH", "源版本与源素材不匹配");
            const now = new Date().toISOString();
            const task: MockTask = {
                taskId: nanoid(),
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
                pollCount: 0,
                simulateFailure: Boolean(mockOptions?.simulateFailure),
            };
            tasks.set(task.taskId, task);
            schedulePersist();
            return { status: 202, taskId: task.taskId };
        },
        async getTask(taskId, signal) {
            signal?.throwIfAborted();
            const task = tasks.get(taskId);
            if (!task) fail("TASK_NOT_FOUND", `任务不存在：${taskId}`);
            if (task.status === "SUCCEEDED" || task.status === "FAILED") return taskInfo(task);
            if (taskProgression === "manual") return taskInfo(task);
            task.pollCount += 1;
            if (task.pollCount === 1) return advanceTask(taskId, "RUNNING");
            return advanceTask(taskId, task.simulateFailure ? "FAILED" : "SUCCEEDED");
        },
        async listVersions(projectId, signal) {
            signal?.throwIfAborted();
            requireProject(projectId);
            return versionHost.getSnapshot(projectId).versions.map((document) => versions.get(document.versionId) || {
                versionId: document.versionId,
                projectId,
                sourceAssetId: null,
                resultAssetId: document.nodes.find((node) => node.metadata?.assetId)?.metadata?.assetId || null,
                createdAt: document.createdAt,
                name: document.title,
            });
        },
        async saveProjectVersion(projectId, version) {
            const versionId = await versionHost.saveVersion(projectId, version);
            const saved = versionHost.getSnapshot(projectId).versions.find((item) => item.versionId === versionId);
            if (!saved) fail("VERSION_SAVE_FAILED", "Mock 版本保存后无法读取");
            return saved;
        },
        async deleteProjectVersion(projectId, versionId) {
            await versionHost.deleteVersion(projectId, versionId);
            versions.delete(versionId);
            schedulePersist();
        },
    };

    const media: CanvasMediaAdapter = {
        async restore(projectId, snapshot, signal) {
            signal.throwIfAborted();
            requireProject(projectId);
            return { nodes: snapshot.nodes, chatSessions: [] };
        },
        async readImage(projectId, image, signal) {
            signal.throwIfAborted();
            requireProject(projectId);
            if (image.storageKey || !image.dataUrl.startsWith("data:image/")) fail("MOCK_IMAGE_REFERENCE_UNSUPPORTED", "Mock 仅支持内存图片引用");
            return image.dataUrl;
        },
        async readMedia(projectId, reference, signal) {
            signal.throwIfAborted();
            requireProject(projectId);
            if (reference.assetId) return api.readAssetContent(projectId, reference.assetId, signal);
            if (reference.url?.startsWith("data:")) {
                const response = await fetch(reference.url, { signal });
                signal.throwIfAborted();
                return response.blob();
            }
            fail("MOCK_MEDIA_UNSUPPORTED", "Mock 无法读取该媒体引用");
        },
        cleanup(_context) {},
    };

    const uploadBinary = async (ticket: CanvasUploadTicket, file: File, signal?: AbortSignal) => {
        signal?.throwIfAborted();
        const upload = uploads.get(ticket.uploadId);
        if (!upload || upload.ticket.projectId !== ticket.projectId) fail("UPLOAD_NOT_FOUND", "上传记录不存在或不属于当前项目");
        upload.blob = file.slice(0, file.size, file.type);
    };
    const taskExecution = createCanvasTaskExecution(api, api);

    return {
        api, projects, projectHost, versionHost, get initialProjectId() { return initialProjectId; }, ready,
        hostAdapters: { api, assets: api, uploads: { ...api, uploadBinary }, tasks: api, results: api, taskExecution, projects: projectHost, versions: versionHost, media },
        uploadBinary,
        advanceTask,
        listTasks,
        failNextDocumentSave() { failNextDocumentSave = true; },
        media,
    };
}
