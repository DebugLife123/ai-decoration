// Dev-gateway credit ledger. The Spring Boot backend will own the authoritative
// ledger later; this store keeps the same two-phase hold/settle/refund semantics
// so the frontend contract does not change when the backend takes over.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage } from 'node:http';

export const CREDIT_COSTS = { floorplanAnalysis: 1, coverImage: 1, roomImage: 1, roomEdit: 0.5 } as const;
export const FREE_SIGNUP_GRANT = 3;
const STORE_PATH = resolve(process.cwd(), '.credits.json');

export type CreditEntryType = 'grant' | 'purchase' | 'hold' | 'consume' | 'refund';
export type CreditEntry = {
  id: string;
  at: string;
  type: CreditEntryType;
  delta: number;
  balanceAfter: number;
  label: string;
  refId?: string;
  status?: 'pending' | 'settled' | 'refunded';
};
export type CreditAccount = { userId: string; displayName: string; planId: string; balance: number; createdAt: string; ledger: CreditEntry[] };
type CreditStore = { accounts: Record<string, CreditAccount> };

export type Identity = { userId: string; displayName: string };

export function resolveIdentity(req: IncomingMessage): Identity | null {
  const userId = String(req.headers['x-user-id'] || '').trim();
  if (!userId || userId.length > 128) return null;
  const displayName = decodeURIComponent(String(req.headers['x-user-name'] || '').trim()).slice(0, 64) || '用户';
  return { userId, displayName };
}

let store: CreditStore | null = null;

function loadStore(): CreditStore {
  if (store) return store;
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as CreditStore;
    store = parsed.accounts && typeof parsed.accounts === 'object' ? parsed : { accounts: {} };
  } catch {
    store = { accounts: {} };
  }
  // Any pending hold belongs to a job that died with the previous server process.
  // Jobs are memory-only, so refund every pending hold on startup.
  for (const account of Object.values(store.accounts)) {
    for (const entry of account.ledger) {
      if (entry.type === 'hold' && entry.status === 'pending') refundHoldEntry(account, entry, '服务重启，未完成任务积分已返还');
    }
  }
  persist();
  return store;
}

function persist() {
  if (!store) return;
  try { writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); } catch (error) { console.error('[credits] persist failed:', error); }
}

function round2(value: number) { return Math.round(value * 100) / 100; }

function refundHoldEntry(account: CreditAccount, entry: CreditEntry, label: string) {
  entry.status = 'refunded';
  account.balance = round2(account.balance + Math.abs(entry.delta));
  account.ledger.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), type: 'refund', delta: Math.abs(entry.delta), balanceAfter: account.balance, label, refId: entry.id });
}

export function getAccount(identity: Identity): CreditAccount {
  const current = loadStore();
  let account = current.accounts[identity.userId];
  if (!account) {
    account = { userId: identity.userId, displayName: identity.displayName, planId: 'free', balance: 0, createdAt: new Date().toISOString(), ledger: [] };
    current.accounts[identity.userId] = account;
  }
  if (identity.displayName && account.displayName !== identity.displayName) account.displayName = identity.displayName;
  if (account.ledger.length === 0 && account.balance === 0) {
    account.balance = FREE_SIGNUP_GRANT;
    account.ledger.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), type: 'grant', delta: FREE_SIGNUP_GRANT, balanceAfter: account.balance, label: '注册赠送积分' });
    persist();
  }
  return account;
}

export type HoldResult = { ok: true; holdId: string; balance: number } | { ok: false; required: number; balance: number };

export function holdCredits(identity: Identity, amount: number, label: string, refId?: string): HoldResult {
  const account = getAccount(identity);
  const needed = round2(Math.max(0, amount));
  if (account.balance < needed) return { ok: false, required: needed, balance: account.balance };
  const holdId = crypto.randomUUID();
  account.balance = round2(account.balance - needed);
  account.ledger.unshift({ id: holdId, at: new Date().toISOString(), type: 'hold', delta: -needed, balanceAfter: account.balance, label, refId, status: 'pending' });
  persist();
  return { ok: true, holdId, balance: account.balance };
}

// Settle a hold: consume up to the held amount, refund the unused remainder.
export function settleHold(holdId: string, consumedAmount: number, label: string) {
  const current = loadStore();
  for (const account of Object.values(current.accounts)) {
    const entry = account.ledger.find((item) => item.id === holdId);
    if (!entry || entry.type !== 'hold' || entry.status !== 'pending') return;
    const held = Math.abs(entry.delta);
    const consumed = round2(Math.min(held, Math.max(0, consumedAmount)));
    entry.status = 'settled';
    if (consumed > 0) {
      account.ledger.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), type: 'consume', delta: 0, balanceAfter: account.balance, label, refId: holdId });
    }
    const refundAmount = round2(held - consumed);
    if (refundAmount > 0) {
      account.balance = round2(account.balance + refundAmount);
      account.ledger.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), type: 'refund', delta: refundAmount, balanceAfter: account.balance, label: '任务结算返还', refId: holdId });
    }
    persist();
    return;
  }
}

export function refundHold(holdId: string, label = '任务失败，积分返还') {
  const current = loadStore();
  for (const account of Object.values(current.accounts)) {
    const entry = account.ledger.find((item) => item.id === holdId);
    if (!entry || entry.type !== 'hold' || entry.status !== 'pending') return;
    refundHoldEntry(account, entry, label);
    persist();
    return;
  }
}

export function grantCredits(identity: Identity, amount: number, planId: string, label: string) {
  const account = getAccount(identity);
  const value = round2(Math.max(0, amount));
  account.balance = round2(account.balance + value);
  account.planId = planId || account.planId;
  account.ledger.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), type: 'purchase', delta: value, balanceAfter: account.balance, label });
  persist();
  return account;
}

export function creditSummary(identity: Identity) {
  const account = getAccount(identity);
  const pending = account.ledger.filter((entry) => entry.type === 'hold' && entry.status === 'pending').reduce((sum, entry) => sum + Math.abs(entry.delta), 0);
  return { userId: account.userId, displayName: account.displayName, planId: account.planId, balance: account.balance, pendingHolds: round2(pending) };
}

export function creditLedger(identity: Identity, limit = 100) {
  const account = getAccount(identity);
  return { summary: creditSummary(identity), entries: account.ledger.slice(0, limit) };
}
