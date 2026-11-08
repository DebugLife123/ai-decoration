export type DesignMode = 'photo' | 'floorplan';
export type DesignStyle = 'modern' | 'minimal' | 'chinese' | 'cream' | 'european' | 'wabi' | 'song' | 'smallAmerican';

/** 图纸来源：CAD 图纸或普通户型图片。 */
export type PlanSource = 'cad' | 'floorplan';

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
  /** 报价来源企业；来自平台材料目录时由后端补全。 */
  companyId?: string;
  companyName?: string;
  companyContactName?: string;
  companyContactInfo?: string;
  imageId?: string | null;
  imageIds?: string[];
  brand?: string;
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
  /** 图纸来源：CAD 图纸或普通户型图（CAD 工作流识别入口使用）。 */
  source?: PlanSource;
  /** 户型/CAD 识别得到的整体分析文本。 */
  analysis?: string;
  /** 识别出的空间列表。 */
  rooms?: IdentifiedRoom[];
  /** 本次选择要生成的空间名称。 */
  selectedRooms?: string[];
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

/** 户型/CAD 识别出的单个空间。 */
export interface IdentifiedRoom {
  name: string;
  description: string;
}

/** 户型/CAD 识别结果。 */
export interface FloorPlanAnalysis {
  analysis: string;
  rooms: IdentifiedRoom[];
}

export type GenerationResult = PhotoGeneration | FloorPlanGeneration;
