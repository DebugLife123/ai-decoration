import type { StoreApi } from "zustand";
import { CanvasApiError, type CanvasApi, type CanvasProjectDocument } from "./contracts";
import type { CanvasStore } from "../../stores/canvas/canvas-state";
import { createCanvasProjectSaveQueue } from "./project-save";
export { createApiCanvasVersionHost, createCanvasVersionHost } from "./version-host";
export type { CanvasVersionHost, CanvasVersionSnapshot } from "./version-host";

export type CanvasProjectMetadata = { projectId: string; name: string };
export type CanvasProjectPresence = (projectId: string) => boolean;
export type CanvasProjectSnapshot = { hydrated: boolean; projects: CanvasProjectMetadata[] };
export type CanvasProjectHost = {
    getSnapshot(): CanvasProjectSnapshot;
    subscribe(listener: () => void): () => void;
    loadProjects(signal?: AbortSignal): Promise<void>;
    createProject(title?: string): Promise<string>;
    getDocument(projectId: string, signal?: AbortSignal): Promise<CanvasProjectDocument | null>;
    saveDocument(projectId: string, document: CanvasProjectDocument): Promise<void>;
    renameProject(projectId: string, title: string): Promise<void>;
    deleteProjects(projectIds: string[]): Promise<void>;
    exportProject?(projectId: string, fileName: string): Promise<void>;
};

export type CanvasProjectHostOptions = {
    beforeSave?: (projectId: string, document: CanvasProjectDocument) => void | Promise<void>;
    exportProject?: (projectId: string, fileName: string) => Promise<void>;
};

export function createCanvasProjectHost(store: StoreApi<CanvasStore>, options: CanvasProjectHostOptions = {}): CanvasProjectHost {
    const saveInOrder = createCanvasProjectSaveQueue();
    const snapshotOf = (state: CanvasStore): CanvasProjectSnapshot => ({
        hydrated: Boolean(state.hydrated),
        projects: (state.projects || []).map(({ id: projectId, title: name }) => ({ projectId, name })),
    });
    let snapshot = snapshotOf(store.getState());
    const publish = (listener: () => void, state: CanvasStore) => {
        const next = snapshotOf(state);
        const unchanged = snapshot.hydrated === next.hydrated && snapshot.projects.length === next.projects.length && snapshot.projects.every((item, index) => {
            const candidate = next.projects[index];
            return item.projectId === candidate.projectId && item.name === candidate.name;
        });
        if (unchanged) return;
        snapshot = next;
        listener();
    };
    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            const unsubscribe = store.subscribe((state) => publish(listener, state));
            publish(listener, store.getState());
            return unsubscribe;
        },
        async loadProjects(signal) { signal?.throwIfAborted(); },
        async createProject(title) { return store.getState().createProject(title); },
        async getDocument(projectId, signal) {
            signal?.throwIfAborted();
            const project = store.getState().openProject(projectId);
            if (!project) return null;
            const { id: _id, title: _title, createdAt: _createdAt, updatedAt: _updatedAt, versions: _versions, ...document } = project;
            signal?.throwIfAborted();
            return { projectId, ...structuredClone(document) };
        },
        async saveDocument(projectId, document) {
            if (projectId !== document.projectId) throw new CanvasApiError("PROJECT_ID_MISMATCH", "画布文档 projectId 不匹配");
            await saveInOrder(projectId, async () => {
                if (!store.getState().openProject(projectId)) throw new CanvasApiError("PROJECT_NOT_FOUND", "项目不存在");
                await options.beforeSave?.(projectId, document);
                const { projectId: _projectId, ...projectDocument } = structuredClone(document);
                store.getState().updateProject(projectId, projectDocument);
            });
        },
        async renameProject(projectId, title) { store.getState().renameProject(projectId, title); },
        async deleteProjects(projectIds) { store.getState().deleteProjects(projectIds); },
        exportProject: options.exportProject,
    };
}

export function createApiCanvasProjectHost(api: Pick<CanvasApi, "listProjects" | "createProject" | "getProjectDocument" | "saveProjectDocument" | "renameProject" | "deleteProject">): CanvasProjectHost {
    const saveInOrder = createCanvasProjectSaveQueue();
    let snapshot: CanvasProjectSnapshot = { hydrated: false, projects: [] };
    const listeners = new Set<() => void>();
    const publish = (next: CanvasProjectSnapshot) => {
        if (snapshot === next) return;
        snapshot = next;
        listeners.forEach((listener) => listener());
    };
    const updateProjects = (projects: CanvasProjectMetadata[]) => publish({ hydrated: true, projects });
    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        async loadProjects(signal) {
            signal?.throwIfAborted();
            const projects = await api.listProjects(signal);
            signal?.throwIfAborted();
            updateProjects(projects.map(({ projectId, name }) => ({ projectId, name })));
        },
        async createProject(title) {
            const project = await api.createProject(title || "未命名方案");
            updateProjects([{ projectId: project.projectId, name: project.name }, ...snapshot.projects]);
            return project.projectId;
        },
        async getDocument(projectId, signal) {
            if (!snapshot.projects.some((project) => project.projectId === projectId)) return null;
            signal?.throwIfAborted();
            const document = await api.getProjectDocument(projectId, signal);
            signal?.throwIfAborted();
            if (document.projectId !== projectId) throw new CanvasApiError("PROJECT_ID_MISMATCH", "画布文档 projectId 不匹配");
            return document;
        },
        async saveDocument(projectId, document) {
            if (projectId !== document.projectId) throw new CanvasApiError("PROJECT_ID_MISMATCH", "画布文档 projectId 不匹配");
            await saveInOrder(projectId, async () => {
                if (!snapshot.projects.some((project) => project.projectId === projectId)) throw new CanvasApiError("PROJECT_NOT_FOUND", "项目不存在");
                await api.saveProjectDocument(projectId, document);
            });
        },
        async renameProject(projectId, title) {
            await api.renameProject(projectId, title);
            updateProjects(snapshot.projects.map((project) => project.projectId === projectId ? { ...project, name: title } : project));
        },
        async deleteProjects(projectIds) {
            for (const projectId of projectIds) {
                await api.deleteProject(projectId);
                updateProjects(snapshot.projects.filter((project) => project.projectId !== projectId));
            }
        },
    };
}

