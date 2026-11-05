import type { MaterialRecord } from './dataContracts';
import { businessApiConfig } from './businessData';
import { currentAccessToken } from './authSession';

type ApiEnvelope<T> = { code: string; message: string; data: T; timestamp: string };
type ApiPage<T> = { items: T[]; page: { page: number; size: number; total: number; totalPages: number } };

interface ApiCatalogMaterial {
  id: string;
  companyId: string;
  companyName: string | null;
  name: string;
  spec: string;
  unit: string;
  price: number;
  category: string;
  region: string;
  validUntil: string;
  updatedAt: string;
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
  }));
}
