export type DesignMode = 'photo' | 'floorplan';
export type DesignStyle = 'modern' | 'minimal' | 'chinese' | 'cream' | 'european' | 'wabi';

export interface DesignImage {
  id: string;
  title: string;
  imageUrl: string;
  description?: string;
}

export interface DesignVersion {
  id: string;
  mode: DesignMode;
  style: DesignStyle;
  prompt: string;
  createdAt: string;
  analysis: string;
  coverImageUrl: string;
  images: DesignImage[];
}

export interface GenerationTask {
  id: string;
  mode: DesignMode;
  style: DesignStyle;
  prompt: string;
  status: 'generating' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface Project {
  id: string;
  name: string;
  spaceType: string;
  style: DesignStyle;
  budget?: number;
  area?: number;
  city?: string;
  region?: string;
  preferences?: string;
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
  version?: number;
}

export interface WorkspaceDataAdapter {
  loadProjects(): Promise<Project[]>;
  saveProjects(projects: Project[]): Promise<boolean>;
  saveProject?(project: Project): Promise<void>;
  deleteProject?(id: string): Promise<void>;
  loadMaterials(): Promise<MaterialRecord[]>;
}

export interface GenerateDesignInput {
  mode: DesignMode;
  style: DesignStyle;
  prompt: string;
  budget?: number;
  photo?: string;
  photos?: string[];
  floorPlan?: string;
}

export interface DesignGenerationAdapter {
  generate(input: GenerateDesignInput): Promise<GenerationResult>;
}

export interface PhotoGeneration {
  type: 'photo';
  imageUrl: string;
  analysis: string;
}

export interface RoomGeneration {
  name: string;
  description: string;
  imageUrl: string;
}

export interface FloorPlanGeneration {
  type: 'floorplan';
  cover: string;
  analysis: string;
  rooms: RoomGeneration[];
}

export type GenerationResult = PhotoGeneration | FloorPlanGeneration;
