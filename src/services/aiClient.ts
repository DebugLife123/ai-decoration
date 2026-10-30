import type { DesignStyle } from '../stores/appStore';
export type DesignMode = 'photo' | 'floorplan';
export type PhotoGeneration = { type: 'photo'; imageUrl: string; analysis: string };
export type RoomGeneration = { name: string; description: string; imageUrl: string };
export type FloorPlanGeneration = { type: 'floorplan'; cover: string; analysis: string; rooms: RoomGeneration[] };
export type GenerationResult = PhotoGeneration | FloorPlanGeneration;
export async function generateDesign(input: { mode: DesignMode; style: DesignStyle; prompt: string; budget?: number; photo?: string; photos?: string[]; floorPlan?: string }): Promise<GenerationResult> {
  const response = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const payload = await response.json() as GenerationResult & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'AI 生成失败，请检查接口配置。');
  return payload;
}
