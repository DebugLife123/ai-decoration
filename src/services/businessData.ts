import type { MaterialRecord } from './dataContracts';
import { readLocalValue, writeLocalValue } from './localDataAdapter';
import { currentAccessToken, readAuthSession } from './authSession';
import { apiBaseUrl } from './apiBase';
import { isUnitRecognized, unitKindOf } from './budgetUnits';
import type { StyleRecommendationProfile } from './styleRecommendation';

export type BusinessRecordStatus = 'draft' | 'published';

export interface CompanyProfileRecord {
  id?: string;
  name: string;
  city: string;
  services: string;
  intro: string;
  publicContactName?: string;
  publicContactInfo?: string;
  serviceAreas?: string;
  businessHours?: string;
  logoAssetId?: string;
  storefrontAssetId?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BusinessCaseRecord {
  id: string;
  title: string;
  area: string;
  style: string;
  budget: string;
  status: BusinessRecordStatus;
  files: string[];
  version?: number;
  updatedAt: string;
}

export interface LaborQuoteRecord {
  id: string;
  type: string;
  unit: string;
  price: string;
  region: string;
  validUntil: string;
  version?: number;
  updatedAt: string;
  /** 计量单位枚举（BudgetUnitKind）。 */
  unitKind?: string;
  unitUnknown?: boolean;
  itemNature?: 'INCLUDED' | 'GIFT' | 'OWNER_SUPPLIED';
}

export type CompanyCertificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CompanyCertificationRecord {
  id: string;
  companyName: string;
  contactName: string;
  contactInfo: string;
  serviceAreas: string[];
  documentRefs: string[];
  status: CompanyCertificationStatus;
  reviewNote: string | null;
  version: number;
  submittedAt: string;
  updatedAt: string;
}

export interface CompanyStyleProfileRecord {
  companyId: string;
  companyName: string | null;
  profiles: StyleRecommendationProfile[];
  version: number;
  updatedAt: string | null;
}

export interface BusinessDataAdapter {
  readonly mode: 'local' | 'api';
  loadProfile(): Promise<CompanyProfileRecord>;
  saveProfile(profile: CompanyProfileRecord): Promise<CompanyProfileRecord>;
  loadStyleProfiles(): Promise<CompanyStyleProfileRecord>;
  saveStyleProfiles(profiles: StyleRecommendationProfile[]): Promise<CompanyStyleProfileRecord>;
  loadCases(): Promise<BusinessCaseRecord[]>;
  createCase(record: Omit<BusinessCaseRecord, 'id' | 'updatedAt'>): Promise<BusinessCaseRecord>;
  updateCase(record: BusinessCaseRecord): Promise<BusinessCaseRecord>;
  publishCase(record: BusinessCaseRecord): Promise<BusinessCaseRecord>;
  deleteCase(record: BusinessCaseRecord): Promise<void>;
  loadMaterials(): Promise<MaterialRecord[]>;
  createMaterial(record: Omit<MaterialRecord, 'id' | 'updatedAt'>): Promise<MaterialRecord>;
  updateMaterial(record: MaterialRecord): Promise<MaterialRecord>;
  submitMaterial?(record: MaterialRecord): Promise<MaterialRecord>;
  withdrawMaterial?(record: MaterialRecord): Promise<MaterialRecord>;
  deleteMaterial(record: MaterialRecord): Promise<void>;
  loadWorkers(): Promise<LaborQuoteRecord[]>;
  createWorker(record: Omit<LaborQuoteRecord, 'id' | 'updatedAt'>): Promise<LaborQuoteRecord>;
  updateWorker(record: LaborQuoteRecord): Promise<LaborQuoteRecord>;
  deleteWorker(record: LaborQuoteRecord): Promise<void>;
  loadCertification(): Promise<CompanyCertificationRecord | null>;
  submitCertification(record: Omit<CompanyCertificationRecord, 'id' | 'status' | 'reviewNote' | 'submittedAt' | 'updatedAt' | 'version'> & { version?: number }): Promise<CompanyCertificationRecord>;
  uploadAsset(file: File): Promise<{ id: string; fileName: string }>;
  deleteAsset(id: string): Promise<void>;
  downloadAsset(id: string): Promise<Blob>;
}

export const businessLocalKeys = {
  profile: 'decoration-business-profile',
  cases: 'decoration-business-cases',
  materials: 'decoration-business-materials',
  workers: 'decoration-business-workers',
  styleProfiles: 'decoration-business-style-profiles',
} as const;

const emptyProfile: CompanyProfileRecord = { name: '', city: '', services: '', intro: '', publicContactName: '', publicContactInfo: '', serviceAreas: '', businessHours: '' };

function now() {
  return new Date().toISOString();
}

/** 本地草稿也补齐单位枚举，保证与远端返回的字段形状一致。 */
function withUnitKind<T extends { unit: string }>(record: T): T & { unitKind: string; unitUnknown: boolean; itemNature: 'INCLUDED' | 'GIFT' | 'OWNER_SUPPLIED' } {
  return { ...record, unitKind: unitKindOf(record.unit), unitUnknown: !isUnitRecognized(record.unit), itemNature: (record as { itemNature?: 'INCLUDED' | 'GIFT' | 'OWNER_SUPPLIED' }).itemNature || 'INCLUDED' };
}

function id() {
  return crypto.randomUUID();
}

function localProfile() {
  return readLocalValue<CompanyProfileRecord>(businessLocalKeys.profile, emptyProfile);
}

function localCases() {
  return readLocalValue<BusinessCaseRecord[]>(businessLocalKeys.cases, []);
}

function localMaterials() {
  return readLocalValue<MaterialRecord[]>(businessLocalKeys.materials, []).map((item) => withUnitKind(item));
}

function localWorkers() {
  return readLocalValue<LaborQuoteRecord[]>(businessLocalKeys.workers, []).map((item) => withUnitKind(item));
}

function localAdapter(): BusinessDataAdapter {
  return {
    mode: 'local',
    async loadProfile() { return localProfile(); },
    async saveProfile(profile) {
      const saved = { ...profile, updatedAt: now() };
      writeLocalValue(businessLocalKeys.profile, saved);
      return saved;
    },
    async loadCases() { return localCases(); },
    async createCase(record) {
      const saved = { ...record, id: id(), updatedAt: now(), version: 0 };
      writeLocalValue(businessLocalKeys.cases, [saved, ...localCases()]);
      return saved;
    },
    async updateCase(record) {
      const saved = { ...record, updatedAt: now(), version: (record.version || 0) + 1 };
      writeLocalValue(businessLocalKeys.cases, localCases().map((item) => item.id === record.id ? saved : item));
      return saved;
    },
    async publishCase(record) {
      const saved = { ...record, status: 'published' as const, updatedAt: now(), version: (record.version || 0) + 1 };
      writeLocalValue(businessLocalKeys.cases, localCases().map((item) => item.id === record.id ? saved : item));
      return saved;
    },
    async deleteCase(record) {
      writeLocalValue(businessLocalKeys.cases, localCases().filter((item) => item.id !== record.id));
    },
    async loadMaterials() { return localMaterials(); },
    async createMaterial(record) {
      const saved = { ...withUnitKind(record), id: id(), updatedAt: now() };
      writeLocalValue(businessLocalKeys.materials, [saved, ...localMaterials()]);
      return saved;
    },
    async updateMaterial(record) {
      const saved = { ...withUnitKind(record), updatedAt: now() };
      writeLocalValue(businessLocalKeys.materials, localMaterials().map((item) => item.id === record.id ? saved : item));
      return saved;
    },
    async submitMaterial(record) { return { ...record, reviewStatus: 'PENDING' as const, updatedAt: now() }; },
    async withdrawMaterial(record) { return { ...record, reviewStatus: 'DRAFT' as const, reviewNote: null, updatedAt: now() }; },
    async deleteMaterial(record) {
      writeLocalValue(businessLocalKeys.materials, localMaterials().filter((item) => item.id !== record.id));
    },
    async loadWorkers() { return localWorkers(); },
    async createWorker(record) {
      const saved = { ...withUnitKind(record), id: id(), updatedAt: now() };
      writeLocalValue(businessLocalKeys.workers, [saved, ...localWorkers()]);
      return saved;
    },
    async updateWorker(record) {
      const saved = { ...withUnitKind(record), updatedAt: now() };
      writeLocalValue(businessLocalKeys.workers, localWorkers().map((item) => item.id === record.id ? saved : item));
      return saved;
    },
    async deleteWorker(record) {
      writeLocalValue(businessLocalKeys.workers, localWorkers().filter((item) => item.id !== record.id));
    },
    async loadStyleProfiles() {
      return {
        companyId: '',
        companyName: null,
        profiles: readLocalValue<StyleRecommendationProfile[]>(businessLocalKeys.styleProfiles, []),
        version: 0,
        updatedAt: null,
      };
    },
    async saveStyleProfiles(profiles) {
      writeLocalValue(businessLocalKeys.styleProfiles, profiles);
      return { companyId: '', companyName: null, profiles, version: 0, updatedAt: now() };
    },
    async loadCertification() { return null; },
    async submitCertification(record) {
      const saved: CompanyCertificationRecord = {
        ...record, id: id(), status: 'PENDING', reviewNote: null, version: record.version ?? 0,
        submittedAt: now(), updatedAt: now(),
      };
      return saved;
    },
    async uploadAsset() { throw new Error('文件上传需要连接平台并使用企业账号登录。'); },
    async deleteAsset() {},
    async downloadAsset() { throw new Error('文件查看需要连接平台并使用企业账号登录。'); },
  };
}

type ApiEnvelope<T> = { code: string; message: string; data: T; timestamp: string };
type ApiPage<T> = { items: T[]; page: { page: number; size: number; total: number; totalPages: number } };
type ApiCase = { id: string; title: string; area: number | null; style: string | null; budget: number | null; status: BusinessRecordStatus; fileIds: string[]; version: number; updatedAt: string };
type ApiMaterial = { id: string; name: string; spec: string; unit: string; price: number; brand: string | null; category: string; region: string; validUntil: string; imageId: string | null; imageIds: string[]; styleKeys?: string[]; materialScope?: 'GENERAL' | 'STYLE'; reviewStatus?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote?: string | null; version: number; updatedAt: string; unitKind?: string | null; unitUnknown?: boolean; itemNature?: string | null };
type ApiWorker = { id: string; type: string; unit: string; price: number; region: string; validUntil: string; version: number; updatedAt: string; unitKind?: string | null; unitUnknown?: boolean; itemNature?: string | null };

function apiAdapter(baseUrl: string): BusinessDataAdapter {
  const base = baseUrl.replace(/\/$/, '');
  async function request<T>(path: string, init?: RequestInit) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${currentAccessToken()}`, ...init?.headers },
    });
    if (response.status === 204) return undefined as T;
    const payload = await response.json() as ApiEnvelope<T>;
    if (!response.ok) {
      throw new Error(`同步接口 ${path} 失败（HTTP ${response.status} · ${payload.code}）：${payload.message || '请求失败'}`);
    }
    return payload.data;
  }
  async function uploadAsset(file: File) {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`${base}/api/v1/business/assets`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${currentAccessToken()}` },
      body,
    });
    const responseText = await response.text();
    let payload: ApiEnvelope<{ id: string; fileName: string }> | undefined;
    try {
      payload = JSON.parse(responseText) as ApiEnvelope<{ id: string; fileName: string }>;
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const code = payload?.code || 'NO_ERROR_CODE';
      const message = payload?.message || responseText.slice(0, 160) || '未返回错误详情';
      throw new Error(`文件上传失败（HTTP ${response.status} · ${code}）：${message}`);
    }
    if (!payload) throw new Error('文件上传失败：服务器响应无法解析。');
    return payload.data;
  }
  async function downloadAsset(id: string) {
    const response = await fetch(`${base}/api/v1/business/assets/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${currentAccessToken()}` },
    });
    if (!response.ok) {
      const payload = await response.json() as ApiEnvelope<unknown>;
      throw new Error(payload.message || `文件读取失败（${response.status}）`);
    }
    return response.blob();
  }
  const key = () => `${crypto.randomUUID()}-${Date.now()}`;
  async function loadAllPages<T>(path: string) {
    const items: T[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const separator = path.includes('?') ? '&' : '?';
      const result = await request<ApiPage<T>>(`${path}${separator}page=${page}&size=100`);
      items.push(...result.items);
      totalPages = result.page.totalPages;
      page += 1;
    } while (page <= totalPages);
    return items;
  }
  const numericField = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const caseFromApi = (item: ApiCase): BusinessCaseRecord => ({ ...item, area: item.area == null ? '' : String(item.area), budget: item.budget == null ? '' : String(item.budget), style: item.style || '', files: item.fileIds || [] });
  const materialFromApi = (item: ApiMaterial): MaterialRecord => ({ ...item, materialScope: item.materialScope || ((item.styleKeys || []).length ? 'STYLE' : 'GENERAL'), imageIds: item.imageIds || (item.imageId ? [item.imageId] : []), brand: item.brand || undefined, price: String(item.price), unitKind: item.unitKind || unitKindOf(item.unit), unitUnknown: item.unitUnknown ?? !isUnitRecognized(item.unit), itemNature: (item.itemNature as MaterialRecord['itemNature']) || 'INCLUDED' });
  const workerFromApi = (item: ApiWorker): LaborQuoteRecord => ({ ...item, price: String(item.price), unitKind: item.unitKind || unitKindOf(item.unit), unitUnknown: item.unitUnknown ?? !isUnitRecognized(item.unit), itemNature: (item.itemNature as LaborQuoteRecord['itemNature']) || 'INCLUDED' });
  return {
    mode: 'api',
    async loadProfile() { return (await request<CompanyProfileRecord | null>('/api/v1/business/profile')) || emptyProfile; },
    async saveProfile(profile) {
      const saved = await request<CompanyProfileRecord>('/api/v1/business/profile', { method: 'PUT', body: JSON.stringify({ name: profile.name, city: profile.city, services: profile.services, intro: profile.intro, publicContactName: profile.publicContactName || '', publicContactInfo: profile.publicContactInfo || '', serviceAreas: profile.serviceAreas || '', businessHours: profile.businessHours || '', logoAssetId: profile.logoAssetId || null, storefrontAssetId: profile.storefrontAssetId || null, ...(profile.version === undefined ? {} : { version: profile.version }) }) });
      window.dispatchEvent(new CustomEvent('business-profile-updated', { detail: saved }));
      return saved;
    },
    async loadCases() { return (await loadAllPages<ApiCase>('/api/v1/business/cases?sort=updatedAt')).map(caseFromApi); },
    async createCase(record) { const data = await request<ApiCase>('/api/v1/business/cases', { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ title: record.title, area: numericField(record.area), style: record.style || undefined, budget: numericField(record.budget), status: record.status, fileIds: record.files }) }); return caseFromApi(data); },
    async updateCase(record) { const data = await request<ApiCase>(`/api/v1/business/cases/${record.id}`, { method: 'PATCH', body: JSON.stringify({ title: record.title, area: numericField(record.area), style: record.style || undefined, budget: numericField(record.budget), status: record.status, fileIds: record.files, version: record.version ?? 0 }) }); return caseFromApi(data); },
    async publishCase(record) { const data = await request<ApiCase>(`/api/v1/business/cases/${record.id}/publish`, { method: 'POST', body: JSON.stringify({ version: record.version ?? 0 }) }); return caseFromApi(data); },
    async deleteCase(record) { await request<void>(`/api/v1/business/cases/${record.id}?version=${record.version ?? 0}`, { method: 'DELETE' }); },
    async loadMaterials() { return (await loadAllPages<ApiMaterial>('/api/v1/business/material-quotes?sort=updatedAt&includeExpired=true')).map(materialFromApi); },
    async createMaterial(record) { const data = await request<ApiMaterial>('/api/v1/business/material-quotes', { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ ...record, imageIds: record.imageIds || (record.imageId ? [record.imageId] : []), styleKeys: record.styleKeys || [], price: Number(record.price) }) }); return materialFromApi(data); },
    async updateMaterial(record) { const data = await request<ApiMaterial>(`/api/v1/business/material-quotes/${record.id}`, { method: 'PATCH', body: JSON.stringify({ name: record.name, spec: record.spec, unit: record.unit, price: Number(record.price), brand: record.brand || '', category: record.category, region: record.region, validUntil: record.validUntil, itemNature: record.itemNature || 'INCLUDED', materialScope: record.materialScope || ((record.styleKeys || []).length ? 'STYLE' : 'GENERAL'), imageIds: record.imageIds || (record.imageId ? [record.imageId] : []), styleKeys: record.styleKeys || [], version: record.version ?? 0 }) }); return materialFromApi(data); },
    async submitMaterial(record) { return materialFromApi(await request<ApiMaterial>(`/api/v1/business/material-quotes/${record.id}/submit`, { method: 'POST' })); },
    async withdrawMaterial(record) { return materialFromApi(await request<ApiMaterial>(`/api/v1/business/material-quotes/${record.id}/withdraw`, { method: 'POST' })); },
    async deleteMaterial(record) { await request<void>(`/api/v1/business/material-quotes/${record.id}?version=${record.version ?? 0}`, { method: 'DELETE' }); },
    async loadWorkers() { return (await loadAllPages<ApiWorker>('/api/v1/business/labor-quotes?sort=updatedAt')).map(workerFromApi); },
    async createWorker(record) { const data = await request<ApiWorker>('/api/v1/business/labor-quotes', { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ ...record, price: Number(record.price) }) }); return workerFromApi(data); },
    async updateWorker(record) { const data = await request<ApiWorker>(`/api/v1/business/labor-quotes/${record.id}`, { method: 'PATCH', body: JSON.stringify({ type: record.type, unit: record.unit, price: Number(record.price), region: record.region, validUntil: record.validUntil, itemNature: record.itemNature || 'INCLUDED', version: record.version ?? 0 }) }); return workerFromApi(data); },
    async deleteWorker(record) { await request<void>(`/api/v1/business/labor-quotes/${record.id}?version=${record.version ?? 0}`, { method: 'DELETE' }); },
    async loadStyleProfiles() {
      const data = await request<CompanyStyleProfileRecord>('/api/v1/business/style-profiles');
      return { ...data, profiles: data.profiles ?? [] };
    },
    async saveStyleProfiles(profiles) {
      const data = await request<CompanyStyleProfileRecord>('/api/v1/business/style-profiles', { method: 'PUT', body: JSON.stringify({ profiles }) });
      return { ...data, profiles: data.profiles ?? [] };
    },
    async loadCertification() { return request<CompanyCertificationRecord | null>('/api/v1/business/certification'); },
    async submitCertification(record) { return request<CompanyCertificationRecord>('/api/v1/business/certification', { method: 'PUT', body: JSON.stringify(record) }); },
    uploadAsset,
    async deleteAsset(id) { await request<void>(`/api/v1/business/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    downloadAsset,
  };
}

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const apiToken = env?.VITE_BUSINESS_API_TOKEN?.trim();

export const businessApiConfig = {
  baseUrl: apiBaseUrl,
  get token() { return currentAccessToken(); },
  enabled: true,
};

const remoteBusinessDataAdapter = apiAdapter(apiBaseUrl);

export const businessDataAdapter: BusinessDataAdapter = new Proxy({} as BusinessDataAdapter, {
  get(_target, property) {
    const session = readAuthSession();
    const useRemote = session ? session.user.accountType === 'business' : Boolean(apiToken);
    const adapter = useRemote ? remoteBusinessDataAdapter : localAdapter();
    const value = Reflect.get(adapter, property);
    return typeof value === 'function' ? value.bind(adapter) : value;
  },
});
