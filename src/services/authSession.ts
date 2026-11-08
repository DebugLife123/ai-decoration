export type AccountType = 'personal' | 'business';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  accountType: AccountType;
  companyId: string | null;
  role: string;
}

export interface AuthSession {
  accessToken: string;
  expiresInSeconds: number;
  user: AuthUser;
  issuedAt?: number;
}

interface ApiEnvelope<T> {
  code: string;
  message: string;
  data: T;
  timestamp: string;
}

const sessionKey = 'decoration-auth-session';
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const authApiBaseUrl = (env?.VITE_BUSINESS_API_URL?.trim() || 'http://localhost:8091').replace(/\/$/, '');

export function readAuthSession(): AuthSession | null {
  try {
    const value = window.sessionStorage.getItem(sessionKey);
    if (!value) return null;
    const session = JSON.parse(value) as AuthSession;
    if (!session.accessToken || !session.user?.id || !session.user.accountType) return null;
    if (session.issuedAt && Date.now() >= session.issuedAt + session.expiresInSeconds * 1000) {
      clearAuthSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession): void {
  window.sessionStorage.setItem(sessionKey, JSON.stringify({ ...session, issuedAt: Date.now() }));
}

export function clearAuthSession(): void {
  window.sessionStorage.removeItem(sessionKey);
}

export function currentAccessToken(): string {
  return readAuthSession()?.accessToken || env?.VITE_BUSINESS_API_TOKEN?.trim() || '';
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${authApiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentAccessToken()}`,
        ...init.headers,
      },
    });
  } catch {
    throw new Error('无法连接服务，请确认后端已启动。');
  }
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok) throw new Error(payload.message || `请求失败（${response.status}）`);
  return payload.data;
}

export async function apiDownload(path: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${authApiBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${currentAccessToken()}` },
    });
  } catch {
    throw new Error('无法连接服务，请确认后端已启动。');
  }
  if (!response.ok) {
    const payload = await response.json() as ApiEnvelope<unknown>;
    throw new Error(payload.message || `文件读取失败（${response.status}）`);
  }
  return response.blob();
}

export async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${authApiBaseUrl}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('无法连接登录服务，请确认后端已启动。');
  }
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok) throw new Error(payload.message || '登录请求失败，请稍后重试。');
  return payload.data;
}
