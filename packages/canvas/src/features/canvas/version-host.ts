import type { StoreApi } from "zustand";
import { CanvasApiError, type CanvasApi, type CanvasVersionDocument } from "./contracts";
import type { CanvasProjectVersion, CanvasStore } from "../../stores/canvas/canvas-state";

export type CanvasVersionSnapshot = {
    versions: CanvasVersionDocument[];
    currentVersionId: string | null;
};

export type CanvasVersionHost = {
    getSnapshot(projectId: string): CanvasVersionSnapshot;
    subscribe(projectId: string, listener: () => void): () => void;
    loadVersions(projectId: string, signal?: AbortSignal): Promise<void>;
    saveVersion(projectId: string, version: Omit<CanvasVersionDocument, "versionId" | "projectId">): Promise<string>;
    deleteVersion(projectId: string, versionId: string): Promise<void>;
};

const EMPTY_PROJECT_VERSIONS: CanvasProjectVersion[] = [];
const EMPTY_VERSION_SNAPSHOT: CanvasVersionSnapshot = Object.freeze({ versions: Object.freeze([]) as unknown as CanvasVersionDocument[], currentVersionId: null });

function freezeSnapshot<T>(value: T): T {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(freezeSnapshot);
    return value;
}

export function createApiCanvasVersionHost(api: Pick<CanvasApi, "listVersions" | "getProjectDocument" | "getProjectVersion" | "saveProjectVersion" | "deleteProjectVersion">): CanvasVersionHost {
    const snapshots = new Map<string, CanvasVersionSnapshot>();
    const listeners = new Map<string, Set<() => void>>();
    const loadRevision = new Map<string, number>();
    const invalidateLoad = (projectId: string) => {
        const next = (loadRevision.get(projectId) || 0) + 1;
        loadRevision.set(projectId, next);
        return next;
    };
    const publish = (projectId: string, next: CanvasVersionSnapshot) => {
        snapshots.set(projectId, freezeSnapshot(next));
        listeners.get(projectId)?.forEach((listener) => listener());
    };
    return {
        getSnapshot: (projectId) => snapshots.get(projectId) || EMPTY_VERSION_SNAPSHOT,
        subscribe(projectId, listener) {
            const projectListeners = listeners.get(projectId) || new Set<() => void>();
            projectListeners.add(listener);
            listeners.set(projectId, projectListeners);
            return () => {
                projectListeners.delete(listener);
                if (!projectListeners.size) listeners.delete(projectId);
            };
        },
        async loadVersions(projectId, signal) {
            const revision = invalidateLoad(projectId);
            try {
                signal?.throwIfAborted();
                const [summaries, document] = await Promise.all([api.listVersions(projectId, signal), api.getProjectDocument(projectId, signal)]);
                const versions = await Promise.all(summaries.map(async ({ versionId }) => {
                    const version = await api.getProjectVersion(projectId, versionId, signal);
                    if (version.projectId !== projectId) throw new CanvasApiError("PROJECT_ID_MISMATCH", "版本 projectId 不匹配");
                    if (version.versionId !== versionId) throw new CanvasApiError("VERSION_ID_MISMATCH", "版本 versionId 不匹配");
                    return version;
                }));
                signal?.throwIfAborted();
                if (loadRevision.get(projectId) !== revision) return;
                publish(projectId, { versions, currentVersionId: document.currentVersionId });
            } catch (error) {
                if (loadRevision.get(projectId) === revision) throw error;
            }
        },
        async saveVersion(projectId, version) {
            invalidateLoad(projectId);
            const saved = await api.saveProjectVersion(projectId, version);
            if (saved.projectId !== projectId) throw new CanvasApiError("PROJECT_ID_MISMATCH", "版本 projectId 不匹配");
            const previous = snapshots.get(projectId) || { versions: [], currentVersionId: null };
            publish(projectId, { versions: [saved, ...previous.versions.filter((item) => item.versionId !== saved.versionId)], currentVersionId: saved.versionId });
            return saved.versionId;
        },
        async deleteVersion(projectId, versionId) {
            invalidateLoad(projectId);
            await api.deleteProjectVersion(projectId, versionId);
            const previous = snapshots.get(projectId) || { versions: [], currentVersionId: null };
            publish(projectId, { versions: previous.versions.filter((item) => item.versionId !== versionId), currentVersionId: previous.currentVersionId === versionId ? null : previous.currentVersionId });
        },
    };
}

export function createCanvasVersionHost(store: StoreApi<CanvasStore>): CanvasVersionHost {
    const snapshots = new Map<string, CanvasVersionSnapshot>();
    const sourceVersions = new Map<string, CanvasProjectVersion[]>();
    const listeners = new Map<string, Set<() => void>>();
    const read = (projectId: string): CanvasVersionSnapshot => {
        const project = store.getState().projects.find((item) => item.id === projectId);
        const previous = snapshots.get(projectId);
        const storedVersions = project?.versions || EMPTY_PROJECT_VERSIONS;
        if (previous && sourceVersions.get(projectId) === storedVersions && previous.currentVersionId === (project?.currentVersionId || null)) return previous;
        sourceVersions.set(projectId, storedVersions);
        const versions: CanvasVersionDocument[] = storedVersions.map(({ id: versionId, ...version }) => freezeSnapshot({ projectId, versionId, ...structuredClone(version) }));
        const next = freezeSnapshot({ versions, currentVersionId: project?.currentVersionId || null });
        snapshots.set(projectId, next);
        return next;
    };
    if (typeof store.subscribe !== "function") {
        return {
            getSnapshot: read,
            subscribe: () => () => undefined,
            async loadVersions(_projectId, signal) { signal?.throwIfAborted(); },
            async saveVersion(projectId, version) {
                if (!store.getState().openProject(projectId)) throw new CanvasApiError("PROJECT_NOT_FOUND", "项目不存在");
                return store.getState().saveProjectVersion(projectId, structuredClone(version));
            },
            async deleteVersion(projectId, versionId) {
                if (!store.getState().openProject(projectId)) throw new CanvasApiError("PROJECT_NOT_FOUND", "项目不存在");
                store.getState().deleteProjectVersion(projectId, versionId);
            },
        };
    }
    store.subscribe((state) => {
        const projectIds = new Set([...snapshots.keys(), ...state.projects.map((project) => project.id)]);
        projectIds.forEach((projectId) => {
            const previous = snapshots.get(projectId);
            const next = read(projectId);
            if (next === previous) return;
            listeners.get(projectId)?.forEach((listener) => listener());
        });
    });
    return {
        getSnapshot: read,
        async loadVersions(_projectId, signal) { signal?.throwIfAborted(); },
        subscribe(projectId, listener) {
            const projectListeners = listeners.get(projectId) || new Set<() => void>();
            projectListeners.add(listener);
            listeners.set(projectId, projectListeners);
            return () => {
                projectListeners.delete(listener);
                if (!projectListeners.size) listeners.delete(projectId);
            };
        },
        async saveVersion(projectId, version) {
            if (!store.getState().openProject(projectId)) throw new CanvasApiError("PROJECT_NOT_FOUND", "项目不存在");
            return store.getState().saveProjectVersion(projectId, structuredClone(version));
        },
        async deleteVersion(projectId, versionId) {
            if (!store.getState().openProject(projectId)) throw new CanvasApiError("PROJECT_NOT_FOUND", "项目不存在");
            store.getState().deleteProjectVersion(projectId, versionId);
        },
    };
}
