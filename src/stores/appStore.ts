import { create } from 'zustand';
import { localWorkspaceDataAdapter } from '../services/localDataAdapter';
import type { DesignStyle, Project } from '../services/dataContracts';

export type { DesignImage, DesignStyle, DesignVersion, GenerationTask, MaterialRecord, Project } from '../services/dataContracts';

export type UserRole = 'guest' | 'consumer' | 'business';

interface AppState {
  role: UserRole;
  setRole: (role: UserRole) => void;
  currentProject: Project | null;
  setCurrentProject: (p: Project | null) => void;
  projects: Project[];
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
  projects: localWorkspaceDataAdapter.loadProjects(),
  storageWarning: '',
  saveProject: (project) => {
    const projects = get().projects;
    const nextProjects = projects.some((item) => item.id === project.id)
      ? projects.map((item) => item.id === project.id ? project : item)
      : [project, ...projects];
    const persisted = localWorkspaceDataAdapter.saveProjects(nextProjects);
    set({ projects: nextProjects, currentProject: project, storageWarning: persisted ? '' : '本次内容已暂存于当前页面，但浏览器存储空间不足，刷新后可能无法恢复。' });
  },
  removeProject: (id) => {
    const nextProjects = get().projects.filter((item) => item.id !== id);
    const persisted = localWorkspaceDataAdapter.saveProjects(nextProjects);
    set({ projects: nextProjects, currentProject: get().currentProject?.id === id ? null : get().currentProject, storageWarning: persisted ? '' : '项目已从当前页面移除，但浏览器存储空间不足，刷新后可能恢复。' });
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
    const persisted = localWorkspaceDataAdapter.saveProjects(nextProjects);
    const currentProject = nextProjects.find((project) => project.id === get().currentProject?.id) || get().currentProject;
    set({ projects: nextProjects, currentProject, storageWarning: persisted ? '' : '材料关联已暂存于当前页面，但浏览器存储空间不足，刷新后可能无法恢复。' });
  },
  selectedStyle: 'modern',
  setSelectedStyle: (selectedStyle) => set({ selectedStyle }),
  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),
}));
