export type CadAssetKind = 'cad-export' | 'reference' | 'style-reference';
export type CadProjectStage = 'intake' | 'brief' | 'plan' | 'birdseye' | 'qa' | 'locked';
export type WorkflowStatus = 'pending' | 'pass' | 'fail' | 'unverifiable';

export type CadAsset = {
  id: string;
  name: string;
  kind: CadAssetKind;
  mimeType: string;
  sizeLabel: string;
  dataUrl?: string;
};

export type PlanModel = {
  schemaVersion: 1;
  source: {
    type: 'cad';
    revision: string;
    unit: 'mm' | 'unknown';
    scale: '1:1' | 'unknown';
    fileIds: string[];
  };
  rooms: Array<{
    id: string;
    name: string;
    description: string;
    confidence: number | null;
    status: 'confirmed' | 'identified' | 'unknown';
  }>;
  walls: Array<{
    id: string;
    thicknessMm: number | null;
    confidence: number | null;
    status: 'confirmed' | 'identified' | 'unknown';
  }>;
  openings: Array<{
    id: string;
    type: 'door' | 'window' | 'unknown';
    roomFrom?: string;
    roomTo?: string;
    widthMm: number | null;
    heightMm: number | null;
    status: 'confirmed' | 'identified' | 'unknown';
  }>;
  connections: Array<{ from: string; to: string; type: 'open' | 'door' | 'unknown' }>;
  uncertainties: string[];
};

export type StyleBrief = {
  id: string;
  name: string;
  referenceIds: string[];
  palette: { primary: string[]; secondary: string[]; accent: string[] };
  materials: Array<{ id: string; name: string; finish?: string; direction?: string; usage: string[] }>;
  furnitureRules: string[];
  lighting: { colorTemperature?: string; scene?: string };
  mustKeep: string[];
  doNotUse: string[];
  revision: string;
};

export type QaCheck = {
  key: 'structure' | 'style' | 'pixel';
  label: string;
  status: WorkflowStatus;
  note: string;
};

export type BirdseyeRun = {
  id: string;
  createdAt: string;
  imageUrl: string;
  nativeWidth: number;
  nativeHeight: number;
  finalWidth: number;
  finalHeight: number;
  targetWidth: 3840;
  targetHeight: 2160;
  isNative4K: false;
  promptSummary: string;
};

export type CadProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: CadProjectStage;
  status: 'draft' | 'blocked' | 'ready' | 'locked';
  sourceType: 'cad';
  nativeCadParsing: false;
  revision: string;
  unit: 'mm' | 'unknown';
  scale: '1:1' | 'unknown';
  assets: CadAsset[];
  missingItems: string[];
  confirmations: string[];
  planModel: PlanModel | null;
  styleBrief: StyleBrief | null;
  birdseye: BirdseyeRun | null;
  qa: QaCheck[];
  gate: { birdseye: 'pending' | 'approved' | 'blocked' };
};
