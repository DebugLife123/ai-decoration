import { authApiBaseUrl, currentAccessToken } from './authSession';

export interface PublicCompany {
  companyId: string;
  name: string;
  city: string | null;
  services: string | null;
  intro: string | null;
  serviceAreas: string[];
  businessHours: string | null;
  publicContactName: string | null;
  publicContactInfo: string | null;
  logoAssetId: string | null;
  storefrontAssetId: string | null;
  caseCount: number;
  materialCount: number;
  certificationStatus: 'APPROVED';
  updatedAt: string | null;
}

type Envelope<T> = { data: T; message?: string };

export async function loadPublicCompany(companyId: string): Promise<PublicCompany> {
  const response = await fetch(`${authApiBaseUrl}/api/v1/companies/${encodeURIComponent(companyId)}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${currentAccessToken()}` },
  });
  const payload = await response.json() as Envelope<PublicCompany>;
  if (!response.ok) throw new Error(payload.message || `企业主页请求失败（${response.status}）`);
  return payload.data;
}

export async function loadPublicCompanyAsset(companyId: string, assetId: string): Promise<Blob> {
  const response = await fetch(`${authApiBaseUrl}/api/v1/companies/${encodeURIComponent(companyId)}/assets/${encodeURIComponent(assetId)}`, {
    headers: { Authorization: `Bearer ${currentAccessToken()}` },
  });
  if (!response.ok) throw new Error(`企业图片读取失败（${response.status}）`);
  return response.blob();
}
