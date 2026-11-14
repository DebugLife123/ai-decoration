import type { StateCreator } from "zustand";
import { nanoid } from "nanoid";
import i18n from "../../i18n";
import type { CanvasBackgroundMode } from "../../lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../../types/canvas";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    versions: CanvasProjectVersion[];
    currentVersionId: string | null;
};

export type CanvasProjectVersion = {
    id: string;
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

export type CanvasDeletedProject = {
    id: string;
    deletedAt: string;
};

export type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    deletedProjects: CanvasDeletedProject[];
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[], deletedProjects?: CanvasDeletedProject[]) => void;
    saveProjectVersion: (id: string, version: Omit<CanvasProjectVersion, "id">) => string;
    deleteProjectVersion: (id: string, versionId: string) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport" | "currentVersionId">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
export const createCanvasState: StateCreator<CanvasStore> = (set, get) => ({
    hydrated: false,
    projects: [],
    deletedProjects: [],
    createProject: (title = i18n.t("canvas.project.untitled")) => {
        const now = new Date().toISOString();
        const id = nanoid();
        const project: CanvasProject = {
            id,
            title,
            createdAt: now,
            updatedAt: now,
            nodes: [],
            connections: [],
            chatSessions: [],
            activeChatId: null,
            backgroundMode: "lines",
            showImageInfo: false,
            viewport: initialViewport,
            versions: [],
            currentVersionId: null,
        };
        set((state) => ({ projects: [project, ...state.projects] }));
        return id;
    },
    importProject: (source) => {
        const now = new Date().toISOString();
        const project: CanvasProject = {
            id: nanoid(),
            title: source.title || i18n.t("canvas.project.imported"),
            createdAt: source.createdAt || now,
            updatedAt: now,
            nodes: source.nodes || [],
            connections: source.connections || [],
            chatSessions: source.chatSessions || [],
            activeChatId: source.activeChatId || null,
            backgroundMode: source.backgroundMode || "lines",
            showImageInfo: source.showImageInfo || false,
            viewport: source.viewport || initialViewport,
            versions: source.versions || [],
            currentVersionId: source.currentVersionId || null,
        };
        set((state) => ({ projects: [project, ...state.projects] }));
        return project.id;
    },
    openProject: (id) => {
        return get().projects.find((item) => item.id === id) || null;
    },
    renameProject: (id, title) =>
        set((state) => ({
            projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
        })),
    deleteProjects: (ids) =>
        set((state) => {
            const now = new Date().toISOString();
            const removing = new Set(ids);
            const projects = state.projects.filter((project) => !removing.has(project.id));
            const deletedProjects = [...state.deletedProjects.filter((item) => !removing.has(item.id)), ...ids.map((id) => ({ id, deletedAt: now }))];
            return { projects, deletedProjects };
        }),
    replaceProjects: (projects, deletedProjects = []) => set({ projects, deletedProjects }),
    saveProjectVersion: (id, version) => {
        const versionId = nanoid();
        const snapshot: CanvasProjectVersion = { ...structuredClone(version), id: versionId };
        set((state) => ({
            projects: state.projects.map((project) => (project.id === id ? { ...project, versions: [snapshot, ...(project.versions || [])], currentVersionId: versionId, updatedAt: new Date().toISOString() } : project)),
        }));
        return versionId;
    },
    deleteProjectVersion: (id, versionId) =>
        set((state) => ({
            projects: state.projects.map((project) =>
                project.id === id
                    ? {
                          ...project,
                          versions: (project.versions || []).filter((version) => version.id !== versionId),
                          currentVersionId: project.currentVersionId === versionId ? null : project.currentVersionId,
                          updatedAt: new Date().toISOString(),
                      }
                    : project,
            ),
        })),
    updateProject: (id, patch) =>
        set((state) => ({
            projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)),
        })),
});

