import { readAuthSession } from './authSession';

// The dev gateway credits module identifies users by headers. The Spring Boot
// backend will enforce JWT-based identity later; the response shape stays the same.
export function gatewayIdentityHeaders(): Record<string, string> {
  const session = readAuthSession();
  if (!session) return {};
  return {
    'X-User-Id': session.user.id,
    'X-User-Name': encodeURIComponent(session.user.displayName || session.user.email || '用户'),
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
