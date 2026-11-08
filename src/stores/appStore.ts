import { create } from 'zustand';
import { workspaceDataAdapter } from '../services/workspaceData';
import type { DesignStyle, Project } from '../services/dataContracts';
import { clearAuthSession, readAuthSession, saveAuthSession, type AuthSession } from '../services/authSession';

export type { DesignImage, DesignStyle, DesignVersion, GenerationTask, MaterialRecord, Project } from '../services/dataContracts';

export type UserRole = 'guest' | 'consumer' | 'business' | 'admin';

function roleFromSession(session: AuthSession | null): UserRole {
  if (session?.user.role === 'PLATFORM_ADMIN') return 'admin';
  return session?.user.accountType === 'business' ? 'business' : session ? 'consumer' : 'guest';
}

interface AppState {
  authSession: AuthSession | null;
  setAuthSession: (session: AuthSession) => void;
  signOut: () => void;
  role: UserRole;
  currentProject: Project | null;
  setCurrentProject: (p: Project | null) => void;
  projects: Project[];
  projectsStatus: 'loading' | 'ready' | 'error';
  projectsError: string;
  loadProjects: () => Promise<void>;
  storageWarning: string;
  saveProject: (p: Project) => void;
  removeProject: (id: string) => void;
  toggleProjectMaterial: (projectId: string, materialId: string) => void;
  selectedStyle: DesignStyle;
  setSelectedStyle: (s: DesignStyle) => void;
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;
}

let projectsLoadPromise: Promise<void> | null = null;

const initialSession = typeof window === 'undefined' ? null : readAuthSession();

export const useAppStore = create<AppState>((set, get) => ({
  authSession: initialSession,
  setAuthSession: (authSession) => {
    saveAuthSession(authSession);
    projectsLoadPromise = null;
    set({ authSession, role: roleFromSession(authSession), projects: [], currentProject: null, projectsStatus: 'loading', projectsError: '', storageWarning: '' });
  },
  signOut: () => {
    clearAuthSession();
    projectsLoadPromise = null;
    set({ authSession: null, role: 'guest', projects: [], currentProject: null, projectsStatus: 'ready', projectsError: '' });
  },
  role: roleFromSession(initialSession),
  currentProject: null,
  setCurrentProject: (currentProject) => set({ currentProject }),
  projects: [],
  projectsStatus: 'loading',
  projectsError: '',
  loadProjects: () => {
    if (projectsLoadPromise) return projectsLoadPromise;
    const requestedUserId = get().authSession?.user.id;
    set({ projectsStatus: 'loading', projectsError: '' });
    const loadPromise = workspaceDataAdapter.loadProjects()
      .then((projects) => {
        if (get().authSession?.user.id === requestedUserId) set({ projects, projectsStatus: 'ready' });
      })
      .catch(() => {
        if (get().authSession?.user.id === requestedUserId) set({ projectsStatus: 'error', projectsError: '项目暂时无法加载，请重试。' });
      })
      .finally(() => {
        if (projectsLoadPromise === loadPromise) projectsLoadPromise = null;
      });
    projectsLoadPromise = loadPromise;
    return loadPromise;
  },
  storageWarning: '',
  saveProject: (project) => {
    const projects = get().projects;
    const nextProjects = projects.some((item) => item.id === project.id)
      ? projects.map((item) => item.id === project.id ? project : item)
      : [project, ...projects];
    set({ projects: nextProjects, currentProject: project, projectsStatus: 'ready', storageWarning: '' });
    const persist = workspaceDataAdapter.saveProject
      ? workspaceDataAdapter.saveProject(project).then(() => true)
      : workspaceDataAdapter.saveProjects(nextProjects);
    void persist.then((persisted) => {
      if (!persisted) set({ storageWarning: '本次内容已暂存于当前页面，但浏览器存储空间不足，刷新后可能无法恢复。' });
    }).catch((error: unknown) => set({ storageWarning: error instanceof Error ? `项目保存失败：${error.message}` : '项目变更未能保存，请稍后重试。' }));
  },
  removeProject: (id) => {
    const nextProjects = get().projects.filter((item) => item.id !== id);
    set({ projects: nextProjects, currentProject: get().currentProject?.id === id ? null : get().currentProject, storageWarning: '' });
    const persist = workspaceDataAdapter.deleteProject
      ? workspaceDataAdapter.deleteProject(id).then(() => true)
      : workspaceDataAdapter.saveProjects(nextProjects);
    void persist.then((persisted) => {
      if (!persisted) set({ storageWarning: '项目已从当前页面移除，但浏览器存储空间不足，刷新后可能恢复。' });
    }).catch((error: unknown) => set({ storageWarning: error instanceof Error ? `项目删除失败：${error.message}` : '项目变更未能保存，请稍后重试。' }));
  },
  toggleProjectMaterial: (projectId, materialId) => {
    const projects = get().projects;
    const nextProjects = projects.map((project) => {
      if (project.id !== projectId) return project;
      const materialIds = project.materialIds.includes(materialId)
        ? project.materialIds.filter((id) => id !== materialId)
        : [...project.materialIds, materialId];
      return { ...project, materialIds, updatedAt: new Date().toISOString() };
    });
    const currentProject = nextProjects.find((project) => project.id === get().currentProject?.id) || get().currentProject;
    set({ projects: nextProjects, currentProject, storageWarning: '' });
    const updatedProject = nextProjects.find((project) => project.id === projectId);
    const persist = updatedProject && workspaceDataAdapter.saveProject
      ? workspaceDataAdapter.saveProject(updatedProject).then(() => true)
      : workspaceDataAdapter.saveProjects(nextProjects);
    void persist.then((persisted) => {
      if (!persisted) set({ storageWarning: '材料关联已暂存于当前页面，但浏览器存储空间不足，刷新后可能无法恢复。' });
    }).catch((error: unknown) => set({ storageWarning: error instanceof Error ? `材料关联保存失败：${error.message}` : '材料关联未能保存，请稍后重试。' }));
  },
  selectedStyle: 'modern',
  setSelectedStyle: (selectedStyle) => set({ selectedStyle }),
  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),
}));
