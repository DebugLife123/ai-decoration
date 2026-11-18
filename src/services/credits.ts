import { apiRequest, readAuthSession } from './authSession';

export interface AdminCreditUser { userId: string; email: string; displayName: string; balance: number; updatedAt: string }
export async function loadAdminCreditUsers(query = '') {
  const users = await apiRequest<AdminCreditUser[]>(`/api/v1/admin/credits/users?query=${encodeURIComponent(query)}`);
  return users.map(row => ({ ...row, balance: row.balance / 100 }));
}
export async function grantTestCredits(userId: string, points: number, note: string) {
  const data = await apiRequest<{ account: {balance: number; updatedAt: string} }>(`/api/v1/admin/credits/users/${encodeURIComponent(userId)}/grant`, {
    method: 'POST', body: JSON.stringify({ units: Math.round(points * 100), note }),
  });
  return { account: { ...data.account, balance: data.account.balance / 100 } };
}

export function gatewayIdentityHeaders(): Record<string, string> {
  const session = readAuthSession();
  if (!session) return {};
  return {
    Authorization: `Bearer ${session.accessToken}`,
  };
}

export type CreditSummary = { userId: string; displayName: string; planId: string; balance: number; pendingHolds: number };
export type CreditEntry = { id: string; at: string; type: 'grant' | 'purchase' | 'hold' | 'consume' | 'refund'; delta: number; balanceAfter: number; label: string; refId?: string; status?: 'pending' | 'settled' | 'refunded' };
export type CreditLedger = { summary: CreditSummary; entries: CreditEntry[] };

export async function fetchCreditSummary(): Promise<CreditSummary> {
  const response = await fetch('/api/credits/summary', { headers: gatewayIdentityHeaders() });
  const payload = await response.json() as CreditSummary & { error?: string };
  if (!response.ok) throw new Error(payload.error || '积分信息读取失败。');
  return payload;
}

export async function fetchCreditLedger(): Promise<CreditLedger> {
  const response = await fetch('/api/credits/ledger', { headers: gatewayIdentityHeaders() });
  const payload = await response.json() as CreditLedger & { error?: string };
  if (!response.ok) throw new Error(payload.error || '积分流水读取失败。');
  return payload;
}

export async function purchaseCredits(payload: { planId?: string; packId?: string }): Promise<{ summary: CreditSummary; granted: number; balance: number }> {
  const response = await fetch('/api/credits/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json', ...gatewayIdentityHeaders() }, body: JSON.stringify(payload) });
  const data = await response.json() as { summary: CreditSummary; granted: number; balance: number; error?: string };
  if (!response.ok) throw new Error(data.error || '积分到账失败，请稍后重试。');
  return data;
}
