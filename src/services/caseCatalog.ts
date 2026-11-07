import { authApiBaseUrl, currentAccessToken } from './authSession';

export interface PublicCaseFile {
  id: string;
  fileName: string;
  mediaType: string;
}

export interface PublicCase {
  id: string;
  title: string;
  area: number | null;
  style: string | null;
  budget: number | null;
  companyId: string;
  companyName: string;
  city: string | null;
  services: string | null;
  files: PublicCaseFile[];
  updatedAt: string;
}

type Page<T> = { items: T[]; page: { totalPages: number } };
type Envelope<T> = { data: T; message?: string };

export async function loadPublicCases(filters: { query: string; style: string; city: string }): Promise<PublicCase[]> {
  const items: PublicCase[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const params = new URLSearchParams({ page: String(page), size: '24' });
    if (filters.query.trim()) params.set('query', filters.query.trim());
    if (filters.style !== '全部') params.set('style', filters.style);
    if (filters.city !== '全部') params.set('city', filters.city);
    const response = await fetch(`${authApiBaseUrl}/api/v1/cases?${params}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${currentAccessToken()}` },
    });
    const payload = await response.json() as Envelope<Page<PublicCase>>;
    if (!response.ok) throw new Error(payload.message || `案例请求失败（${response.status}）`);
    items.push(...payload.data.items);
    totalPages = payload.data.page.totalPages;
    page += 1;
  } while (page <= totalPages && page <= 20);
  return items;
}

export async function loadPublicCaseFile(caseId: string, fileId: string): Promise<Blob> {
  const response = await fetch(`${authApiBaseUrl}/api/v1/cases/${encodeURIComponent(caseId)}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${currentAccessToken()}` },
  });
  if (!response.ok) throw new Error(`案例资料读取失败（${response.status}）`);
  return response.blob();
}
