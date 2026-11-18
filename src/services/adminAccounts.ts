import { apiRequest } from './authSession';

export type ManagedAccountType = 'PERSONAL' | 'BUSINESS';
export type ManagedAccountStatus = 'ACTIVE' | 'DISABLED';
export interface ManagedAccount {
  id: string; email: string; displayName: string; accountType: ManagedAccountType; status: ManagedAccountStatus;
  companyId: string | null; companyName: string | null; certificationStatus: string;
  materialCount: number; caseCount: number; balance: number; createdAt: string; lastLoginAt: string | null;
}
export interface AccountPage { items: ManagedAccount[]; page: number; size: number; total: number; totalPages: number }
export interface AccountDetail {
  account: ManagedAccount;
  creditEntries: Array<{ id: string; delta: number; balanceAfter: number; eventType: string; note: string | null; createdAt: string }>;
  submissions: Array<{ id: string; title: string; style: string; status: string; updatedAt: string }>;
}
export interface AccountInput { email: string; displayName: string; companyName: string }
export async function listAccounts(filters: { type: ManagedAccountType; status: string; query: string; page: number }) {
  const data = await apiRequest<AccountPage>(`/api/v1/admin/accounts?${new URLSearchParams({ ...filters, page: String(filters.page), size: '20' })}`);
  return { ...data, items: data.items.map(row => ({ ...row, balance: row.balance / 100 })) };
}
export async function getAccount(id: string) {
  const data = await apiRequest<AccountDetail>(`/api/v1/admin/accounts/${id}`);
  return { ...data, account: { ...data.account, balance: data.account.balance / 100 }, creditEntries: data.creditEntries.map(row => ({ ...row, delta: row.delta / 100, balanceAfter: row.balanceAfter / 100 })) };
}
export function createAccount(input: AccountInput & { accountType: ManagedAccountType; password: string }) {
  return apiRequest<ManagedAccount>('/api/v1/admin/accounts', { method: 'POST', body: JSON.stringify(input) });
}
export function updateAccount(id: string, input: AccountInput) {
  return apiRequest<ManagedAccount>(`/api/v1/admin/accounts/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}
export function setAccountStatus(id: string, status: ManagedAccountStatus) {
  return apiRequest<ManagedAccount>(`/api/v1/admin/accounts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export function deleteAccount(id: string) { return apiRequest<void>(`/api/v1/admin/accounts/${id}`, { method: 'DELETE' }); }
