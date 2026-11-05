import type { DesignStyle } from './dataContracts';

export interface StyleRecommendationProfile {
  style: DesignStyle;
  name: string;
  note: string;
  reason: string;
  minBudgetWan: number;
  maxBudgetWan?: number;
  regions?: string[];
  priority?: number;
}

export interface StyleRecommendationInput {
  budgetWan: number;
  area?: number;
  region?: string;
}

export interface StyleCaseSignal {
  style: DesignStyle;
  area?: number;
  budgetWan?: number;
  region?: string;
  published?: boolean;
}

// Temporary fallback profiles. Company supplied profiles can replace this list
// without changing the budget page or the recommendation calculation.
export const fallbackStyleProfiles: StyleRecommendationProfile[] = [
  { style: 'modern', name: '现代简约', note: '留白、干净、轻盈', reason: '造型和装饰较克制，预算更容易集中在收纳、照明和实用主材上。', minBudgetWan: 0, maxBudgetWan: 10, priority: 3 },
  { style: 'minimal', name: '北欧原木', note: '原木、亚麻、自然光', reason: '适合控制复杂造型，用自然材质和简单家具建立舒适感。', minBudgetWan: 0, maxBudgetWan: 18, priority: 2 },
  { style: 'wabi', name: '自然侘寂', note: '肌理、安静、自然', reason: '适合使用微水泥、艺术涂料和木质材料，施工工艺会影响最终成本。', minBudgetWan: 8, maxBudgetWan: 35, priority: 1 },
  { style: 'cream', name: '奶油法式', note: '柔和、温润、松弛', reason: '适合把预算投入墙面、灯光和软装，形成完整的氛围感。', minBudgetWan: 10, maxBudgetWan: 30, priority: 2 },
  { style: 'chinese', name: '新中式', note: '木色、留白、东方线条', reason: '可以通过局部木作和软装表达风格，适合分阶段完善。', minBudgetWan: 12, maxBudgetWan: 40, priority: 2 },
  { style: 'european', name: '轻奢欧式', note: '石材、金属、克制质感', reason: '更依赖石材、金属和定制细节，建议为主材和定制预留充足预算。', minBudgetWan: 25, priority: 2 },
];

function matchesBudget(profile: StyleRecommendationProfile, budgetWan: number) {
  return budgetWan >= profile.minBudgetWan && (profile.maxBudgetWan === undefined || budgetWan <= profile.maxBudgetWan);
}

function matchesRegion(profile: StyleRecommendationProfile, region?: string) {
  if (!profile.regions?.length || !region?.trim()) return true;
  return profile.regions.some((item) => region.includes(item) || item.includes(region));
}

export function recommendStyles(input: StyleRecommendationInput, profiles = fallbackStyleProfiles): StyleRecommendationProfile[] {
  if (!Number.isFinite(input.budgetWan) || input.budgetWan <= 0) return [];
  const matching = profiles.filter((profile) => matchesBudget(profile, input.budgetWan) && matchesRegion(profile, input.region));
  const candidates = matching.length ? matching : profiles;
  return [...candidates].sort((a, b) => {
    const aDistance = matchesBudget(a, input.budgetWan) ? 0 : Math.min(Math.abs(input.budgetWan - a.minBudgetWan), Math.abs(input.budgetWan - (a.maxBudgetWan ?? input.budgetWan)));
    const bDistance = matchesBudget(b, input.budgetWan) ? 0 : Math.min(Math.abs(input.budgetWan - b.minBudgetWan), Math.abs(input.budgetWan - (b.maxBudgetWan ?? input.budgetWan)));
    return aDistance - bDistance || (b.priority || 0) - (a.priority || 0);
  }).slice(0, 3);
}

function caseSimilarity(input: StyleRecommendationInput, item: StyleCaseSignal) {
  const budgetScore = item.budgetWan && input.budgetWan > 0
    ? 1 / (1 + Math.abs(Math.log((item.budgetWan + 1) / (input.budgetWan + 1))))
    : 0.35;
  const areaScore = item.area && input.area && input.area > 0
    ? 1 / (1 + Math.abs(item.area - input.area) / input.area)
    : 0.35;
  const regionScore = input.region?.trim() && item.region?.trim()
    ? (item.region.includes(input.region.trim()) || input.region.trim().includes(item.region) ? 1 : 0.7)
    : 0.5;
  return budgetScore * 0.6 + areaScore * 0.25 + regionScore * 0.15;
}

/**
 * Ranks styles from published company cases. Keep this separate from the
 * profile fallback so a future API can pass case data without changing UI code.
 */
export function recommendStylesFromCases(input: StyleRecommendationInput, cases: StyleCaseSignal[], profiles = fallbackStyleProfiles): StyleRecommendationProfile[] {
  const usableCases = cases.filter((item) => item.published !== false && item.style && (item.budgetWan || item.area));
  if (!usableCases.length) return recommendStyles(input, profiles);
  const scores = new Map<DesignStyle, { score: number; count: number }>();
  usableCases.forEach((item) => {
    const current = scores.get(item.style) || { score: 0, count: 0 };
    current.score += caseSimilarity(input, item);
    current.count += 1;
    scores.set(item.style, current);
  });
  return [...profiles]
    .filter((profile) => scores.has(profile.style))
    .sort((a, b) => {
      const aValue = scores.get(a.style)!;
      const bValue = scores.get(b.style)!;
      return bValue.score / bValue.count - aValue.score / aValue.count || (b.priority || 0) - (a.priority || 0);
    })
    .concat(recommendStyles(input, profiles).filter((profile) => !scores.has(profile.style)))
    .slice(0, 3);
}
