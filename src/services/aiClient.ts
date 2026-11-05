import type { DesignGenerationAdapter, FloorPlanAnalysis, GenerateDesignInput, GenerationResult, PlanSource } from './dataContracts';

export type {
  DesignMode,
  FloorPlanAnalysis,
  FloorPlanGeneration,
  GenerationResult,
  IdentifiedRoom,
  PhotoGeneration,
  PlanSource,
  RoomGeneration,
} from './dataContracts';

export const httpGenerationAdapter: DesignGenerationAdapter = {
  async generate(input) {
    const response = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const payload = await response.json() as GenerationResult & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'AI 生成失败，请检查接口配置。');
    return payload;
  },
};

export const generateDesign = (input: GenerateDesignInput) => httpGenerationAdapter.generate(input);

/** 识别 CAD / 户型图，返回空间分析结果，供分房间生成使用。 */
export async function analyzeFloorPlan(floorPlan: string, source: PlanSource = 'floorplan'): Promise<FloorPlanAnalysis> {
  const response = await fetch('/api/ai/analyze-floorplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floorPlan, source }) });
  const payload = await response.json() as FloorPlanAnalysis & { error?: string };
  if (!response.ok) throw new Error(payload.error || '户型识别失败，请检查接口配置。');
  return payload;
}
