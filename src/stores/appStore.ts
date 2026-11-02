import { create } from 'zustand';

export type UserRole = 'guest' | 'consumer' | 'business';
export type DesignStyle = 'modern' | 'song' | 'smallAmerican' | 'minimal' | 'chinese' | 'cream' | 'european' | 'wabi';

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

export interface Company {
  id: string;
  name: string;
  logo: string;
  rating: number;
  reviewCount: number;
  city: string;
  styles: DesignStyle[];
  minBudget: number;
  maxBudget: number;
  cases: number;
  verified: boolean;
  description: string;
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
  companies: Company[];
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;
}

const mockCompanies: Company[] = [
  {
    id: '1', name: '美家装饰设计', logo: '', rating: 4.8, reviewCount: 326,
    city: '上海', styles: ['modern', 'minimal'], minBudget: 80000, maxBudget: 500000,
    cases: 156, verified: true, description: '专注现代简约与轻奢风格，提供全案设计服务'
  },
  {
    id: '2', name: '雅舍空间设计', logo: '', rating: 4.9, reviewCount: 512,
    city: '北京', styles: ['chinese', 'wabi'], minBudget: 120000, maxBudget: 800000,
    cases: 234, verified: true, description: '新中式与侘寂美学专家，注重材质与光影表达'
  },
  {
    id: '3', name: '欧陆经典装饰', logo: '', rating: 4.6, reviewCount: 189,
    city: '广州', styles: ['european', 'cream'], minBudget: 100000, maxBudget: 600000,
    cases: 98, verified: false, description: '欧式古典与法式奶油风格，进口主材直供'
  },
  {
    id: '4', name: '极简生活研究所', logo: '', rating: 4.7, reviewCount: 445,
    city: '深圳', styles: ['minimal', 'modern'], minBudget: 60000, maxBudget: 300000,
    cases: 178, verified: true, description: '极简主义倡导者，用最少元素创造最大空间感'
  },
];

export const useAppStore = create<AppState>((set) => ({
  role: 'guest',
  setRole: (role) => set({ role }),
  currentProject: null,
  setCurrentProject: (currentProject) => set({ currentProject }),
  projects: [],
  addProject: (p) => set((s) => ({ projects: [...s.projects, p] })),
  selectedStyle: 'modern',
  setSelectedStyle: (selectedStyle) => set({ selectedStyle }),
  companies: mockCompanies,
  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),
}));
