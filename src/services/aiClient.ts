import type { DesignStyle } from '../stores/appStore';
export type DesignMode = 'photo' | 'floorplan';
export type PhotoGeneration = { type: 'photo'; imageUrl: string; analysis: string };
export type RoomGeneration = { name: string; description: string; imageUrl: string; review?: { status: 'pass' | 'check' | 'unverified'; note: string } };
export type IdentifiedRoom = {
  id?: string;
  name: string;
  description: string;
  suggestedName?: string;
  confidence?: number | null;
  status?: 'confirmed' | 'identified' | 'unknown';
  evidence?: { type: string; detail: string }[];
  adjacentTo?: string[];
  bounds?: { x: number; y: number; width: number; height: number } | null;
};
export type FloorPlanAnalysis = { analysis: string; rooms: IdentifiedRoom[] };
export type FloorPlanGeneration = { type: 'floorplan'; cover: string; analysis: string; rooms: RoomGeneration[] };
export type GenerationResult = PhotoGeneration | FloorPlanGeneration;
export type PlanSource = 'cad' | 'floorplan';
export async function analyzeFloorPlan(floorPlan: string, source: PlanSource = 'floorplan'): Promise<FloorPlanAnalysis> {
  const response = await fetch('/api/ai/analyze-floorplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floorPlan, source }) });
  const payload = await response.json() as FloorPlanAnalysis & { error?: string };
  if (!response.ok) throw new Error(payload.error || '户型识别失败，请检查接口配置。');
  return payload;
}
export async function generateDesign(input: { mode: DesignMode; style: DesignStyle; prompt: string; photo?: string; photos?: string[]; floorPlan?: string; source?: PlanSource; analysis?: string; rooms?: IdentifiedRoom[]; selectedRooms?: string[]; roomReferenceImages?: { name: string; image: string }[] }): Promise<GenerationResult> {
  const response = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const payload = await response.json() as GenerationResult & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'AI 生成失败，请检查接口配置。');
  return payload;
}
