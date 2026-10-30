import { create } from 'zustand';

export type UserRole = 'guest' | 'consumer' | 'business';
export type DesignStyle = 'modern' | 'minimal' | 'chinese' | 'cream' | 'european' | 'wabi';

export interface Project {
  id: string;
  name: string;
  spaceType: string;
  style: DesignStyle;
  budget: number;
  area: number;
  city: string;
  createdAt: string;
  status: 'draft' | 'generating' | 'completed';
  thumbnail?: string;
  floorPlanUrl?: string;
  photoUrls: string[];
  generatedResults: GeneratedResult[];
}

export interface GeneratedResult {
  id: string;
  style: DesignStyle;
  imageUrl: string;
  prompt: string;
  createdAt: string;
}

interface AppState {
  role: UserRole;
  setRole: (role: UserRole) => void;
  currentProject: Project | null;
  setCurrentProject: (p: Project | null) => void;
  projects: Project[];
  addProject: (p: Project) => void;
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

export const useAppStore = create<AppState>((set) => ({
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
  addProject: (p) => set((s) => ({ projects: [...s.projects, p] })),
  selectedStyle: 'modern',
  setSelectedStyle: (selectedStyle) => set({ selectedStyle }),
  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),
}));
