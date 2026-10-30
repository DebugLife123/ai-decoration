import { create } from 'zustand';

export type UserRole = 'guest' | 'consumer' | 'business';
export type DesignStyle = 'modern' | 'minimal' | 'chinese' | 'cream' | 'european' | 'wabi';

export interface Project {
  id: string;
  name: string;
  spaceType: string;
  style: DesignStyle;
  budget?: number;
  area?: number;
  city?: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  thumbnail?: string;
  floorPlanUrl?: string;
  photoUrls: string[];
  versions: DesignVersion[];
  tasks: GenerationTask[];
  materialIds: string[];
}

export interface MaterialRecord {
  id: string;
  name: string;
  spec: string;
  unit: string;
  price: string;
  category: string;
  region: string;
  validUntil: string;
  updatedAt: string;
}

export interface DesignImage {
  id: string;
  title: string;
  imageUrl: string;
  description?: string;
}

export interface DesignVersion {
  id: string;
  mode: 'photo' | 'floorplan';
  style: DesignStyle;
  prompt: string;
  createdAt: string;
  analysis: string;
  coverImageUrl: string;
  images: DesignImage[];
}

export interface GenerationTask {
  id: string;
  mode: 'photo' | 'floorplan';
  style: DesignStyle;
  prompt: string;
  status: 'generating' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

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

function savedProjects(): Project[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem('decoration-projects-v1');
    const parsed = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Project => Boolean(
      item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string',
    )).map((item) => ({
      ...item,
      spaceType: typeof item.spaceType === 'string' ? item.spaceType : '未分类空间',
      style: item.style || 'modern',
      budget: typeof item.budget === 'number' && Number.isFinite(item.budget) ? item.budget : undefined,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      status: ['draft', 'generating', 'completed', 'failed'].includes(item.status) ? item.status : 'draft',
      photoUrls: Array.isArray(item.photoUrls) ? item.photoUrls : [],
      versions: Array.isArray(item.versions) ? item.versions : [],
      tasks: Array.isArray(item.tasks) ? item.tasks : [],
      materialIds: Array.isArray(item.materialIds) ? item.materialIds : [],
    }));
  } catch {
    return [];
  }
}

function persistProjects(projects: Project[]) {
  try {
    window.localStorage.setItem('decoration-projects-v1', JSON.stringify(projects));
    return true;
  } catch {
    return false;
  }
}

export function readBusinessMaterials(): MaterialRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem('decoration-business-materials');
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is MaterialRecord => Boolean(
      item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string',
    )) : [];
  } catch {
    return [];
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
  projects: savedProjects(),
  storageWarning: '',
  saveProject: (project) => {
    const projects = get().projects;
    const nextProjects = projects.some((item) => item.id === project.id)
      ? projects.map((item) => item.id === project.id ? project : item)
      : [project, ...projects];
    const persisted = persistProjects(nextProjects);
    set({ projects: nextProjects, currentProject: project, storageWarning: persisted ? '' : '本次内容已暂存于当前页面，但浏览器存储空间不足，刷新后可能无法恢复。' });
  },
  removeProject: (id) => {
    const nextProjects = get().projects.filter((item) => item.id !== id);
    const persisted = persistProjects(nextProjects);
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
    const persisted = persistProjects(nextProjects);
    const currentProject = nextProjects.find((project) => project.id === get().currentProject?.id) || get().currentProject;
    set({ projects: nextProjects, currentProject, storageWarning: persisted ? '' : '材料关联已暂存于当前页面，但浏览器存储空间不足，刷新后可能无法恢复。' });
  },
  selectedStyle: 'modern',
  setSelectedStyle: (selectedStyle) => set({ selectedStyle }),
  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),
}));
