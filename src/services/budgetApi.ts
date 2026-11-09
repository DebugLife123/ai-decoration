/**
 * 预算试算 API（阶段 2a-2）。
 *
 * 设计原则：后端不可用或请求失败时返回 null，调用方回退到本地计算。
 * 预算页绝不能因为接口挂掉而白屏——原来的 referenceCosts 就是兜底。
 */
import { businessApiConfig } from './businessData';
import { readAuthSession, currentAccessToken } from './authSession';

export interface BudgetQuoteSample {
  quoteId: string;
  name: string;
  price: number;
  unit: string;
  unitKind: string;
  companyName: string;
}

export interface BudgetItem {
  itemKey: string;
  label: string;
  unitKind: string;
  basis: string | null;
  quantity: number | null;
  appliedMinQty: boolean;
  appliedMinQtyRule: string | null;
  wasteRate: number;
  disabled: boolean;
  materialCostLow: number;
  materialCostHigh: number;
  laborCostLow: number;
  laborCostHigh: number;
  /** 单价（元/计量单位），不含工程量与损耗。 */
  materialPriceLow: number | null;
  materialPriceHigh: number | null;
  laborPriceLow: number | null;
  laborPriceHigh: number | null;
  costLow: number;
  costHigh: number;
  /** QUOTED / PARTIAL / REFERENCE / DISABLED —— 整项口径。 */
  source: 'QUOTED' | 'PARTIAL' | 'REFERENCE' | 'DISABLED';
  /** 材料一路的口径：QUOTED / REFERENCE / NONE。 */
  materialSource: 'QUOTED' | 'REFERENCE' | 'NONE';
  /** 人工一路的口径：QUOTED / REFERENCE / NONE。 */
  laborSource: 'QUOTED' | 'REFERENCE' | 'NONE';
  skippedReasons: string[];
  quoteSamples: BudgetQuoteSample[];
}

export interface EstimateResult {
  totalLow: number;
  totalHigh: number;
  targetBudget: number | null;
  overBudgetStatus: 'OVER' | 'UNDER' | 'WITHIN' | null;
  dataQuality: 'REFERENCE' | 'PARTIAL' | 'QUOTED';
  pricingMode: 'LIST' | 'PACKAGE';
  modelVersion: string;
  interiorArea: number;
  wallArea: number;
  materialCostLow: number;
  materialCostHigh: number;
  laborCostLow: number;
  laborCostHigh: number;
  items: BudgetItem[];
  warnings: string[];
  generatedAt: string;
}

export interface SavedBudget {
  id: string;
  projectId: string | null;
  pricingMode: string;
  modelVersion: string;
  totalLow: number;
  totalHigh: number;
  dataQuality: string;
  result: EstimateResult;
  createdAt: string;
}

export interface EstimateInput {
  area: number;
  region?: string;
  finishLevel?: 'BASIC' | 'STANDARD' | 'PREMIUM';
  spaceType?: string;
  projectId?: string | null;
  disabledItems?: string[];
  enabledItems?: string[];
  targetBudget?: number | null;
}

type ApiEnvelope<T> = { code: string; message: string; data: T; timestamp: string };

function authHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${currentAccessToken()}`,
  };
}

/** 试算是匿名的（登录前就能看预算参考），与 /api/v1/styles/recommendations 一致。 */
export async function estimateBudget(input: EstimateInput): Promise<EstimateResult | null> {
  if (!businessApiConfig.enabled) return null;
  try {
    const response = await fetch(`${businessApiConfig.baseUrl}/api/v1/budgets/estimate`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const payload = await response.json() as ApiEnvelope<EstimateResult>;
    return payload.data ?? null;
  } catch {
    return null;
  }
}

/** 保存到项目；未登录会失败，调用方按需提示。 */
export async function saveBudget(input: EstimateInput): Promise<SavedBudget | null> {
  if (!businessApiConfig.enabled) return null;
  const headers = authHeaders();
  const response = await fetch(`${businessApiConfig.baseUrl}/api/v1/budgets`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const payload = await response.json() as ApiEnvelope<SavedBudget>;
  if (!response.ok) throw new Error(payload.message || `预算保存失败（${response.status}）`);
  return payload.data ?? null;
}

export async function listBudgets(projectId?: string | null): Promise<SavedBudget[]> {
  if (!businessApiConfig.enabled || !readAuthSession()) return [];
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const response = await fetch(`${businessApiConfig.baseUrl}/api/v1/budgets${query}`, {
    headers: authHeaders(),
  });
  if (!response.ok) return [];
  const payload = await response.json() as ApiEnvelope<SavedBudget[]>;
  return payload.data ?? [];
}

export async function deleteBudget(id: string): Promise<boolean> {
  if (!businessApiConfig.enabled || !readAuthSession()) return false;
  const response = await fetch(`${businessApiConfig.baseUrl}/api/v1/budgets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return response.ok;
}
