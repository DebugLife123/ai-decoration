import type { DesignGenerationAdapter, GenerateDesignInput, GenerationResult } from './dataContracts';
export type { DesignMode, FloorPlanGeneration, GenerationResult, PhotoGeneration, RoomGeneration } from './dataContracts';

export const httpGenerationAdapter: DesignGenerationAdapter = {
  async generate(input) {
    const response = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const payload = await response.json() as GenerationResult & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'AI 生成失败，请检查接口配置。');
    return payload;
  },
};

export const generateDesign = (input: GenerateDesignInput) => httpGenerationAdapter.generate(input);
