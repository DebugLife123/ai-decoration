import { create } from 'zustand';
import { workspaceDataAdapter } from '../services/workspaceData';
import type { DesignStyle, Project } from '../services/dataContracts';

export type { DesignImage, DesignStyle, DesignVersion, GenerationTask, MaterialRecord, Project } from '../services/dataContracts';

export type UserRole = 'guest' | 'consumer' | 'business';

interface AppState {
  role: UserRole;
  setRole: (role: UserRole) => void;
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

function savedRole(): UserRole {
  if (typeof window === 'undefined') return 'consumer';
  try {
    const value = window.localStorage.getItem('decoration-active-role');
    return value === 'business' || value === 'consumer' ? value : 'consumer';
  } catch {
    return 'consumer';
  }
}

let projectsLoadPromise: Promise<void> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  role: savedRole(),
  setRole: (role) => {
    try {
      window.localStorage.setItem('decoration-active-role', role);
    } catch {
      // Role switching still works when browser storage is unavailable.
    }
    set({ role });
  },
  currentProject: null,
  setCurrentProject: (currentProject) => set({ currentProject }),
  projects: [],
  projectsStatus: 'loading',
  projectsError: '',
  loadProjects: () => {
    if (projectsLoadPromise) return projectsLoadPromise;
    set({ projectsStatus: 'loading', projectsError: '' });
    projectsLoadPromise = workspaceDataAdapter.loadProjects()
      .then((projects) => set({ projects, projectsStatus: 'ready' }))
      .catch(() => set({ projectsStatus: 'error', projectsError: '项目暂时无法加载，请重试。' }))
      .finally(() => { projectsLoadPromise = null; });
    return projectsLoadPromise;
  },
  storageWarning: '',
  saveProject: (project) => {
    const projects = get().projects;
    const nextProjects = projects.some((item) => item.id === project.id)
      ? projects.map((item) => item.id === project.id ? project : item)
      : [project, ...projects];
    set({ projects: nextProjects, currentProject: project, projectsStatus: 'ready', storageWarning: '' });
    void workspaceDataAdapter.saveProjects(nextProjects).then((persisted) => {
      if (!persisted) set({ storageWarning: '本次内容已暂存于当前页面，但浏览器存储空间不足，刷新后可能无法恢复。' });
    }).catch(() => set({ storageWarning: '本次内容未能保存，请稍后重试。' }));
  },
  removeProject: (id) => {
    const nextProjects = get().projects.filter((item) => item.id !== id);
    set({ projects: nextProjects, currentProject: get().currentProject?.id === id ? null : get().currentProject, storageWarning: '' });
    void workspaceDataAdapter.saveProjects(nextProjects).then((persisted) => {
      if (!persisted) set({ storageWarning: '项目已从当前页面移除，但浏览器存储空间不足，刷新后可能恢复。' });
    }).catch(() => set({ storageWarning: '项目变更未能保存，请稍后重试。' }));
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
    void workspaceDataAdapter.saveProjects(nextProjects).then((persisted) => {
      if (!persisted) set({ storageWarning: '材料关联已暂存于当前页面，但浏览器存储空间不足，刷新后可能无法恢复。' });
    }).catch(() => set({ storageWarning: '材料关联未能保存，请稍后重试。' }));
  },
  selectedStyle: 'modern',
  setSelectedStyle: (selectedStyle) => set({ selectedStyle }),
  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),
}));
