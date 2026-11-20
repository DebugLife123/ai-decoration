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

/** 套餐内含的配置项（模板「配置内全包价」）。 */
export interface BudgetPackageItem {
  itemKey: string;
  label: string;
}

/** PACKAGE 模式下命中的套餐。套餐价是确定值，所以 baseCostLow 与 baseCostHigh 相等。 */
export interface BudgetPackageProduct {
  id: string;
  name: string;
  /** 企业自报价套餐有值；平台通用套餐为 null。 */
  companyName: string | null;
  pricePerSqm: number;
  minArea: number;
  /** 按输入面积推算的外墙周长（米）。 */
  perimeterEstimate: number;
  /** 实测框架面积 = 套内面积 + 外墙厚度 × 周长。 */
  measuredArea: number;
  /** 实际计价面积 = max(实测框架面积, 最低计价面积)。 */
  billableArea: number;
  minAreaApplied: boolean;
  baseCostLow: number;
  baseCostHigh: number;
}

export interface EstimateResult {
  totalLow: number;
  totalHigh: number;
  targetBudget: number | null;
  overBudgetStatus: 'OVER' | 'UNDER' | 'WITHIN' | null;
  dataQuality: 'REFERENCE' | 'PARTIAL' | 'QUOTED' | 'PACKAGE';
  pricingMode: 'LIST' | 'PACKAGE';
  modelVersion: string;
  interiorArea: number;
  wallArea: number;
  materialCostLow: number;
  materialCostHigh: number;
  laborCostLow: number;
  laborCostHigh: number;
  /** Both LIST and PACKAGE management fee are 10% of direct cost. */
  managementFeeLow: number;
  managementFeeHigh: number;
  directCostLow: number;
  directCostHigh: number;
  contractTotalLow: number;
  contractTotalHigh: number;
  taxLow: number;
  taxHigh: number;
  remoteFeeLow: number;
  remoteFeeHigh: number;
  floorSurchargeLow: number;
  floorSurchargeHigh: number;
  highCeilingFeeLow: number;
  highCeilingFeeHigh: number;
  payableTotalLow: number;
  payableTotalHigh: number;
  remoteFeeRate: number;
  /** PACKAGE 模式下命中的套餐；LIST 模式为 null。 */
  packageProduct: BudgetPackageProduct | null;
  /** 套餐已含的配置项；LIST 模式为空。 */
  packageItems: BudgetPackageItem[];
  /** 套餐外可选的增项；LIST 模式为空。 */
  addonOptions: BudgetPackageItem[];
  /** 套餐外的增项；LIST 模式为空。与 items 互斥，不能相加。 */
  addonItems: BudgetItem[];
  /** 逐板块清单；PACKAGE 模式为空。 */
  items: BudgetItem[];
  warnings: string[];
  styleCode: string | null;
  styleName: string | null;
  styleMaterialFactor: number | null;
  stylePriceLowPerSqm: number | null;
  stylePriceHighPerSqm: number | null;
  styleMaterials: StyleMaterialReference[];
  materialGrade: 'ECONOMY' | 'STANDARD' | 'PREMIUM';
  materialGradeFactor: number;
  regionPriceTier: 'FIRST_TIER' | 'STANDARD' | 'COUNTY';
  regionPriceFactor: number;
  generatedAt: string;
}

export interface StyleMaterialReference {
  category: string;
  materialName: string;
  specification: string;
  unit: string;
  priceLow: number;
  priceHigh: number;
  estimateNote: string;
}

export interface StyleReference {
  styleCode: string;
  styleName: string;
  materialFactor: number;
  priceLowPerSqm: number;
  priceHighPerSqm: number;
  estimateNote: string;
  materials: StyleMaterialReference[];
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
  /** LIST 逐板块计价，PACKAGE 按套餐单价 × 实测框架面积；缺省 LIST。两种模式的结果不能相加。 */
  pricingMode?: 'LIST' | 'PACKAGE';
  /** PACKAGE 模式下指定套餐；缺省用平台通用套餐。 */
  packageId?: string | null;
  projectId?: string | null;
  disabledItems?: string[];
  enabledItems?: string[];
  targetBudget?: number | null;
  floorLevel?: number;
  hasElevator?: boolean;
  ceilingHeight?: number;
  isCounty?: boolean;
  styleCode?: string;
  materialGrade?: 'ECONOMY' | 'STANDARD' | 'PREMIUM';
  regionPriceTier?: 'AUTO' | 'FIRST_TIER' | 'STANDARD' | 'COUNTY';
}

type ApiEnvelope<T> = { code: string; message: string; data: T; timestamp: string };

function authHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${currentAccessToken()}`,
  };
}

/** 展示参考价格公开；执行预算试算需要真实用户会话。 */
export async function estimateBudget(input: EstimateInput): Promise<EstimateResult | null> {
  const session = readAuthSession();
  if (!businessApiConfig.enabled || !session) return null;
  try {
    const response = await fetch(`${businessApiConfig.baseUrl}/api/v1/budgets/estimate`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const payload = await response.json() as ApiEnvelope<EstimateResult>;
    return payload.data ?? null;
  } catch {
    return null;
  }
}

export async function listBudgetStyleReferences(): Promise<StyleReference[]> {
  if (!businessApiConfig.enabled) return [];
  try {
    const response = await fetch(`${businessApiConfig.baseUrl}/api/v1/budgets/style-references`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const payload = await response.json() as ApiEnvelope<StyleReference[]>;
    return payload.data ?? [];
  } catch {
    return [];
  }
}

/** 保存到项目；未登录会失败，调用方按需提示。 */
export async function saveBudget(input: EstimateInput): Promise<SavedBudget | null> {
  if (!businessApiConfig.enabled) return null;
  const headers = authHeaders();
  headers['Idempotency-Key'] = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `budget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
