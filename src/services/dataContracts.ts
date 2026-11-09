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
  /** 计量单位枚举（BudgetUnitKind）。UNKNOWN 表示单位无法识别，预算计算会跳过。 */
  unitKind?: string;
  unitUnknown?: boolean;
  /** INCLUDED 计价项 / GIFT 赠送项 / OWNER_SUPPLIED 业主自购，后两者不计入合同造价。 */
  itemNature?: 'INCLUDED' | 'GIFT' | 'OWNER_SUPPLIED';
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
  /** 上传图纸的尺寸信息，供后端判断是否需要二次压缩。 */
  imageMeta?: PlanImageMeta;
  /** 按空间裁切的户型局部参考图，帮助模型对齐空间位置。 */
  roomReferenceImages?: { name: string; image: string }[];
}

export interface DesignGenerationAdapter {
  generate(input: GenerateDesignInput): Promise<GenerationResult>;
}

export interface PhotoGeneration {
  type: 'photo';
  imageUrl: string;
  analysis: string;
}

/** 单张空间效果图的自动复核结论。 */
export interface RoomReview {
  status: 'pass' | 'check' | 'unverified';
  note: string;
}

export interface RoomGeneration {
  name: string;
  description: string;
  imageUrl: string;
  /** 生成后的自动复核结果；缺失时前端按 unverified 展示。 */
  review?: RoomReview;
}

export interface FloorPlanGeneration {
  type: 'floorplan';
  cover: string;
  analysis: string;
  rooms: RoomGeneration[];
}

/** 上传图纸在浏览器端的尺寸记录。 */
export interface PlanImageMeta {
  sourceWidth: number;
  sourceHeight: number;
  sentWidth: number;
  sentHeight: number;
  sourceBytes: number;
}

/** 户型/CAD 识别出的单个空间。 */
export interface IdentifiedRoom {
  name: string;
  description: string;
  /** 模型给出的候选名称，需人工确认后才可作为定名。 */
  id?: string;
  suggestedName?: string;
  confidence?: number | null;
  status?: 'confirmed' | 'identified' | 'unknown';
  evidence?: { type: string; detail: string }[];
  adjacentTo?: string[];
  /** 在原图中的相对位置（0~1），用于裁切空间参考图。 */
  bounds?: { x: number; y: number; width: number; height: number } | null;
}

/** 户型/CAD 识别结果。 */
export interface FloorPlanAnalysis {
  analysis: string;
  rooms: IdentifiedRoom[];
}

export type GenerationResult = PhotoGeneration | FloorPlanGeneration;

/** 全屋生成任务的后端快照，轮询进度时逐步合并。 */
export interface GenerationJob {
  id: string;
  requestId: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  stage: string;
  message: string;
  completedRooms: number;
  totalRooms: number;
  coverReady?: boolean;
  completedRoomNames?: string[];
  cover?: string;
  analysis?: string;
  rooms?: RoomGeneration[];
  failedRooms?: string[];
  error?: string;
}
