import { businessApiConfig } from './businessData';
import type { StyleRecommendationProfile } from './styleRecommendation';
import { currentAccessToken, readAuthSession } from './authSession';

type ApiEnvelope<T> = { code: string; message: string; data: T; timestamp: string };

/** 平台侧风格推荐候选（已认证企业公开的风格资料）。 */
const cacheKey = 'decoration-platform-style-recommendations';
const cacheTtlMs = 5 * 60 * 1000;

type CacheEntry = { at: number; profiles: StyleRecommendationProfile[] };

let memory: CacheEntry | null = null;

function readCache(): StyleRecommendationProfile[] | null {
  if (memory && Date.now() - memory.at < cacheTtlMs) return memory.profiles;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || !Array.isArray(parsed.profiles) || Date.now() - parsed.at > cacheTtlMs) return null;
    memory = parsed;
    return parsed.profiles;
  } catch {
    return null;
  }
}

function writeCache(profiles: StyleRecommendationProfile[]) {
  memory = { at: Date.now(), profiles };
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(memory));
  } catch {
    // 缓存失败不影响主流程
  }
}

export function clearPlatformStyleCache() {
  memory = null;
  try {
    sessionStorage.removeItem(cacheKey);
  } catch {
    // ignore
  }
}

async function fetchPlatformStyles(): Promise<StyleRecommendationProfile[]> {
  const response = await fetch(`${businessApiConfig.baseUrl}/api/v1/styles/recommendations`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`风格推荐加载失败（${response.status}）`);
  const payload = await response.json() as ApiEnvelope<StyleRecommendationProfile[]>;
  return (payload.data ?? []).map((item) => ({
    style: item.style,
    name: item.name,
    note: item.note ?? '',
    reason: item.reason ?? '',
    minBudgetWan: Number(item.minBudgetWan ?? 0),
    maxBudgetWan: item.maxBudgetWan == null ? undefined : Number(item.maxBudgetWan),
    regions: item.regions ?? [],
    priority: item.priority ?? 1,
    companyName: item.companyName ?? undefined,
  }));
}

/**
 * 读取「可用于 C 端推荐」的风格资料。
 * - 未接入平台（无 baseUrl）或请求失败：返回 null，调用方回退内置 fallbackStyleProfiles。
 * - 平台可用但没有企业资料：返回 null（同样回退），避免把空集合当成「企业要求无推荐」。
 */
export async function loadPlatformStyleProfiles(options: { force?: boolean } = {}): Promise<StyleRecommendationProfile[] | null> {
  if (!businessApiConfig.enabled) return null;
  if (!options.force) {
    const cached = readCache();
    if (cached && cached.length) return cached;
  }
  try {
    const profiles = await fetchPlatformStyles();
    if (!profiles.length) return null;
    writeCache(profiles);
    return profiles;
  } catch {
    return null;
  }
}

export function hasPlatformSession() {
  return businessApiConfig.enabled && Boolean(readAuthSession() || currentAccessToken());
}
