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
//
// 这 8 条必须覆盖 DesignStyle 的全部取值：工作台的风格 chip 直接由
// styleCatalog 生成，任何缺失都会让"按预算推荐"落到工作台选不到的风格上。
export const fallbackStyleProfiles: StyleRecommendationProfile[] = [
  { style: 'modern', name: '现代简约', note: '留白、干净、轻盈', reason: '造型和装饰较克制，预算更容易集中在收纳、照明和实用主材上。', minBudgetWan: 0, maxBudgetWan: 15, priority: 3 },
  { style: 'minimal', name: '北欧原木', note: '原木、亚麻、自然光', reason: '适合控制复杂造型，用自然材质和简单家具建立舒适感。', minBudgetWan: 0, maxBudgetWan: 25, priority: 2 },
  { style: 'wabi', name: '自然侘寂', note: '肌理、安静、自然', reason: '适合使用微水泥、艺术涂料和木质材料，施工工艺会影响最终成本。', minBudgetWan: 8, maxBudgetWan: 40, priority: 1 },
  { style: 'cream', name: '奶油法式', note: '柔和、温润、松弛', reason: '适合把预算投入墙面、灯光和软装，形成完整的氛围感。', minBudgetWan: 10, maxBudgetWan: 35, priority: 2 },
  { style: 'chinese', name: '新中式', note: '木色、留白、东方线条', reason: '可以通过局部木作和软装表达风格，适合分阶段完善。', minBudgetWan: 12, maxBudgetWan: 55, priority: 2 },
  { style: 'european', name: '轻奢欧式', note: '石材、金属、克制质感', reason: '更依赖石材、金属和定制细节，建议为主材和定制预留充足预算。', minBudgetWan: 25, maxBudgetWan: 120, priority: 2 },
  { style: 'song', name: '宋式美学', note: '深木、陶器、东方留白', reason: '木作格栅与手工肌理占成本比重高，适合中等以上预算做局部重点。', minBudgetWan: 15, maxBudgetWan: 80, priority: 2 },
  { style: 'smallAmerican', name: '小美风格', note: '奶油线框、橄榄绿、复古细节', reason: '线框柜门与黄铜五金会抬高定制成本，但可用标准柜体控制总价。', minBudgetWan: 10, maxBudgetWan: 45, priority: 1 },
];

function matchesBudget(profile: StyleRecommendationProfile, budgetWan: number) {
  return budgetWan >= profile.minBudgetWan && (profile.maxBudgetWan === undefined || budgetWan <= profile.maxBudgetWan);
}

function matchesRegion(profile: StyleRecommendationProfile, region?: string) {
  if (!profile.regions?.length || !region?.trim()) return true;
  return profile.regions.some((item) => region.includes(item) || item.includes(region));
}

const RECOMMENDATION_LIMIT = 3;
const UNBOUNDED_DISTANCE = 10_000;

function budgetDistance(profile: StyleRecommendationProfile, budgetWan: number) {
  if (matchesBudget(profile, budgetWan)) return 0;
  const lowerGap = Math.abs(budgetWan - profile.minBudgetWan);
  // 无上限的风格（如过去的轻奢欧式）按"远"处理，用有限值避免
  // Infinity - Infinity = NaN 让排序结果变得不确定。
  const upperGap = profile.maxBudgetWan === undefined ? UNBOUNDED_DISTANCE : Math.abs(budgetWan - profile.maxBudgetWan);
  return Math.min(lowerGap, upperGap);
}

export function recommendStyles(input: StyleRecommendationInput, profiles = fallbackStyleProfiles): StyleRecommendationProfile[] {
  if (!Number.isFinite(input.budgetWan) || input.budgetWan <= 0 || !profiles.length) return [];
  // 同时对预算和地区命中的优先；不足 3 条时用其余风格按预算距离补齐，
  // 避免出现"只推荐 1-2 条"或"推荐集合与可用风格不交集"的情况。
  const ranked = [...profiles].sort((a, b) => {
    const aHit = Number(matchesBudget(a, input.budgetWan) && matchesRegion(a, input.region));
    const bHit = Number(matchesBudget(b, input.budgetWan) && matchesRegion(b, input.region));
    return bHit - aHit
      || budgetDistance(a, input.budgetWan) - budgetDistance(b, input.budgetWan)
      || (b.priority || 0) - (a.priority || 0);
  });
  return ranked.slice(0, RECOMMENDATION_LIMIT);
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
