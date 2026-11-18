import type { MaterialRecord } from './dataContracts';
import { businessApiConfig } from './businessData';
import { currentAccessToken } from './authSession';
import { isUnitRecognized, unitKindOf } from './budgetUnits';

type ApiEnvelope<T> = { code: string; message: string; data: T; timestamp: string };
type ApiPage<T> = { items: T[]; page: { page: number; size: number; total: number; totalPages: number } };

interface ApiCatalogMaterial {
  id: string;
  companyId: string;
  companyName: string | null;
  companyContactName: string | null;
  companyContactInfo: string | null;
  name: string;
  spec: string;
  unit: string;
  price: number;
  brand: string | null;
  category: string;
  region: string;
  validUntil: string;
  imageId: string | null;
  imageIds: string[];
  updatedAt: string;
  unitKind?: string | null;
  unitUnknown?: boolean;
  itemNature?: string | null;
  styleKeys?: string[];
}

/**
 * 平台材料目录：只包含已认证企业录入且在有效期内的报价，C 端只读。
 */
export async function loadCatalogMaterials(): Promise<MaterialRecord[]> {
  const base = businessApiConfig.baseUrl.replace(/\/$/, '');
  const items: ApiCatalogMaterial[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await fetch(`${base}/api/v1/materials?page=${page}&size=100&sort=updatedAt`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${currentAccessToken()}`,
      },
    });
    const payload = await response.json() as ApiEnvelope<ApiPage<ApiCatalogMaterial>>;
    if (!response.ok) throw new Error(payload.message || `材料目录请求失败（${response.status}）`);
    items.push(...payload.data.items);
    totalPages = payload.data.page.totalPages;
    page += 1;
  } while (page <= totalPages && page <= 20);
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    spec: item.spec,
    unit: item.unit,
    price: String(item.price),
    category: item.category,
    region: item.region,
    validUntil: item.validUntil,
    updatedAt: item.updatedAt,
    companyId: item.companyId,
    companyName: item.companyName || undefined,
    companyContactName: item.companyContactName || undefined,
    companyContactInfo: item.companyContactInfo || undefined,
    imageId: item.imageId || undefined,
    imageIds: item.imageIds?.length ? item.imageIds : item.imageId ? [item.imageId] : [],
    brand: item.brand || undefined,
    unitKind: item.unitKind || unitKindOf(item.unit),
    unitUnknown: item.unitUnknown ?? !isUnitRecognized(item.unit),
    itemNature: (item.itemNature as MaterialRecord['itemNature']) || 'INCLUDED',
    styleKeys: item.styleKeys || [],
  }));
}

export async function loadCatalogMaterialImage(quoteId: string, imageId: string): Promise<Blob> {
  const base = businessApiConfig.baseUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/api/v1/business/assets/public/materials/${encodeURIComponent(quoteId)}/images/${encodeURIComponent(imageId)}`, {
    headers: { Authorization: `Bearer ${currentAccessToken()}` },
  });
  if (!response.ok) throw new Error(`材料图片读取失败（${response.status}）`);
  return response.blob();
}
