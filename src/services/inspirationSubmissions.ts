import { apiBaseUrl } from './apiBase';
import { apiDownload, apiRequest, currentAccessToken } from './authSession';

export interface InspirationSubmissionImage { id: string; fileName: string; mediaType: string; position: number; }
export interface InspirationSubmissionMaterial { id: string; name: string; brand: string | null; specification: string | null; unit: string; price: number; }
export interface InspirationSubmission { id: string; ownerId: string; ownerEmail: string; submitterType: 'PERSONAL' | 'BUSINESS'; companyId: string | null; companyName: string | null; title: string; style: string; description: string | null; area: number | null; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote: string | null; createdAt: string; updatedAt: string; images: InspirationSubmissionImage[]; materials: InspirationSubmissionMaterial[]; }

export function listMySubmissions() { return apiRequest<InspirationSubmission[]>('/api/v1/inspiration/submissions/mine'); }
export function updateSubmission(id: string, input: { title: string; style: string; description: string; area: string }) { return apiRequest<InspirationSubmission>(`/api/v1/inspiration/submissions/${id}`, { method: 'PUT', body: JSON.stringify({ ...input, area: input.area.trim() ? Number(input.area) : null }) }); }
export function deleteSubmission(id: string) { return apiRequest<void>(`/api/v1/inspiration/submissions/${id}`, { method: 'DELETE' }); }
export function listPublicSubmissions() { return apiRequest<InspirationSubmission[]>('/api/v1/inspiration/submissions/public'); }
export function listAdminSubmissions(status = 'ALL', query = '') { const params = new URLSearchParams({ status }); if (query.trim()) params.set('query', query.trim()); return apiRequest<InspirationSubmission[]>(`/api/v1/admin/inspiration-submissions?${params}`); }
export function reviewSubmission(id: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', reviewNote: string) { return apiRequest<InspirationSubmission>(`/api/v1/admin/inspiration-submissions/${id}/review`, { method: 'PUT', body: JSON.stringify({ status, reviewNote }) }); }
export function submissionImageUrl(submissionId: string, imageId: string, admin = false) { return `${apiBaseUrl}${admin ? `/api/v1/admin/inspiration-submissions/${submissionId}/images/${imageId}` : `/api/v1/inspiration/submissions/${submissionId}/images/${imageId}`}`; }
export async function uploadSubmission(input: { title: string; style: string; description: string; area: string; images: File[] }) {
  const form = new FormData(); form.set('title', input.title); form.set('style', input.style); form.set('description', input.description); form.set('area', input.area); input.images.forEach((file) => form.append('images', file));
  const response = await fetch(`${apiBaseUrl}/api/v1/inspiration/submissions`, { method: 'POST', headers: { Authorization: `Bearer ${currentAccessToken()}` }, body: form });
  const payload = await response.json() as { message?: string; data: InspirationSubmission };
  if (!response.ok) throw new Error(payload.message || '投稿提交失败');
  return payload.data;
}
export function listBusinessStyleSubmissions() { return apiRequest<InspirationSubmission[]>('/api/v1/business/style-submissions'); }
export function updateBusinessStyleSubmission(id: string, input: { title: string; style: string; description: string; materialIds: string[] }) { return apiRequest<InspirationSubmission>(`/api/v1/business/style-submissions/${id}`, { method: 'PUT', body: JSON.stringify(input) }); }
export function deleteBusinessStyleSubmission(id: string) { return apiRequest<void>(`/api/v1/business/style-submissions/${id}`, { method: 'DELETE' }); }
export function loadBusinessSubmissionImage(id: string, imageId: string) { return apiDownload(`/api/v1/business/style-submissions/${id}/images/${imageId}`); }
export async function uploadBusinessStyleSubmission(input: { title: string; style: string; description: string; materialIds: string[]; images: File[] }) {
  const form = new FormData(); form.set('title', input.title); form.set('style', input.style); form.set('description', input.description); input.materialIds.forEach((id) => form.append('materialIds', id)); input.images.forEach((file) => form.append('images', file));
  const response = await fetch(`${apiBaseUrl}/api/v1/business/style-submissions`, { method: 'POST', headers: { Authorization: `Bearer ${currentAccessToken()}` }, body: form });
  const payload = await response.json() as { message?: string; data: InspirationSubmission };
  if (!response.ok) throw new Error(payload.message || '风格模板提交失败');
  return payload.data;
}
export async function loadSubmissionImage(submissionId: string, imageId: string, admin = false) { return apiDownload(admin ? `/api/v1/admin/inspiration-submissions/${submissionId}/images/${imageId}` : `/api/v1/inspiration/submissions/${submissionId}/images/${imageId}`); }
