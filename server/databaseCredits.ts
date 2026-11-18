import type { IncomingMessage } from 'node:http';

export const CREDIT_COSTS = { floorplanAnalysis: 1, coverImage: 1, roomImage: 1, roomEdit: 0.5 } as const;
type Identity = { userId: string; displayName: string };
type Ledger = { entries: unknown[]; summary: { userId: string; balance: number; pendingHolds: number; planId: string; displayName?: string } };

export function databaseCredits(env: Record<string, string>) {
  const base = (env.BACKEND_URL || 'http://127.0.0.1:8091').replace(/\/$/, '');
  async function call<T>(path: string, body?: unknown): Promise<T> {
    if (!env.CREDIT_GATEWAY_SECRET || env.CREDIT_GATEWAY_SECRET.length < 32) throw new Error('积分网关未配置');
    const res = await fetch(`${base}/internal/wallet/${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'X-Wallet-Key': env.CREDIT_GATEWAY_SECRET }, body: JSON.stringify(body) });
    const payload = await res.json() as { message?: string; code?: string; data: T };
    if (!res.ok) throw Object.assign(new Error(payload.message || '积分服务不可用'), { code: payload.code });
    return payload.data as T;
  }
  async function resolveIdentity(req: IncomingMessage): Promise<Identity | null> {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    const res = await fetch(`${base}/api/v1/auth/me`, { headers: { Authorization: auth }, redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const { data } = await res.json() as { data?: { id: string; displayName: string; role: string } };
    return data?.role === 'PERSONAL_USER' ? { userId: data.id, displayName: data.displayName } : null;
  }
  async function creditLedger(user: Identity) {
    const ledger = await call<Ledger>(user.userId);
    ledger.summary.displayName = user.displayName;
    return ledger;
  }
  async function holdCredits(user: Identity, amount: number, label: string, ref?: string) {
    const units = Math.round(amount * 100);
    try {
      const op = await call<{ id: string }>('reserve', { owner: user.userId, key: ref || crypto.randomUUID(), units, label });
      return { ok: true as const, holdId: { owner: user.userId, id: op.id } };
    } catch (err) {
      if ((err as { code?: string }).code !== 'INSUFFICIENT_CREDITS') throw err;
      return { ok: false as const, required: amount, balance: (await creditLedger(user)).summary.balance };
    }
  }
  async function settleHold(hold: { owner: string; id: string }, amount: number, _label?: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await call('settle', { ...hold, consumed: Math.round(amount * 100) }); return; }
      catch { if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1))); }
    }
    console.error('[wallet] reconciliation required', { operation: hold.id, consumedUnits: Math.round(amount * 100) });
  }
  return { resolveIdentity, creditLedger, holdCredits, settleHold, refundHold: (hold: { owner: string; id: string }) => settleHold(hold, 0) };
}
