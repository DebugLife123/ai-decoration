import type { BirdseyeRun, CadAsset, CadProject, PlanModel, QaCheck, StyleBrief } from '../types/cadWorkflow';

type ApiError = { error?: string };
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init });
  const payload = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(payload.error || 'CAD 工作流请求失败，请稍后重试。');
  return payload;
}

export function createCadProject(input: { name: string; revision: string; unit: 'mm' | 'unknown'; scale: '1:1' | 'unknown' }) {
  return request<CadProject>('/api/cad/projects', { method: 'POST', body: JSON.stringify(input) });
}
export function getCadProject(projectId: string) { return request<CadProject>(`/api/cad/projects/${projectId}`); }
export function updateCadProject(projectId: string, input: Partial<Pick<CadProject, 'name' | 'revision' | 'unit' | 'scale' | 'missingItems' | 'confirmations'>>) {
  return request<CadProject>(`/api/cad/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function addCadAsset(projectId: string, asset: Omit<CadAsset, 'id'>) {
  return request<CadProject>(`/api/cad/projects/${projectId}/assets`, { method: 'POST', body: JSON.stringify(asset) });
}
export function saveCadSnapshot(projectId: string, input: { revision: string; unit: 'mm' | 'unknown'; scale: '1:1' | 'unknown'; confirmations: string[] }) {
  return request<CadProject>(`/api/cad/projects/${projectId}/snapshot`, { method: 'POST', body: JSON.stringify(input) });
}
export function analyzeCadPlan(projectId: string, assetId: string) {
  return request<{ project: CadProject; planModel: PlanModel }>(`/api/cad/projects/${projectId}/plan/analyze`, { method: 'POST', body: JSON.stringify({ assetId }) });
}
export function updatePlanModel(projectId: string, planModel: PlanModel) {
  return request<CadProject>(`/api/cad/projects/${projectId}/plan`, { method: 'PATCH', body: JSON.stringify({ planModel }) });
}
export function updateStyleBrief(projectId: string, styleBrief: StyleBrief) {
  return request<CadProject>(`/api/cad/projects/${projectId}/style-brief`, { method: 'PATCH', body: JSON.stringify({ styleBrief }) });
}
export function generateBirdseye(projectId: string) {
  return request<{ project: CadProject; run: BirdseyeRun }>(`/api/cad/projects/${projectId}/runs/birdseye`, { method: 'POST' });
}
export function submitCadQa(projectId: string, checks: QaCheck[]) {
  return request<CadProject>(`/api/cad/projects/${projectId}/qa`, { method: 'POST', body: JSON.stringify({ checks }) });
}
export function approveBirdseye(projectId: string) {
  return request<CadProject>(`/api/cad/projects/${projectId}/gates/birdseye/approve`, { method: 'POST' });
}
