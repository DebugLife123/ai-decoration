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

async function readApiEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return null;
  try {
    return await response.json() as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

const sessionKey = 'decoration-auth-session';
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const authApiBaseUrl = (env?.VITE_BUSINESS_API_URL?.trim() || (env?.DEV ? 'http://localhost:8091' : '')).replace(/\/$/, '');

export function readAuthSession(): AuthSession | null {
  try {
    const value = window.sessionStorage.getItem(sessionKey);
    if (!value) return null;
    const session = JSON.parse(value) as AuthSession;
    if (session.user?.role === 'LOCAL_DEMO' || session.accessToken === 'local-demo-session') {
      clearAuthSession();
      return null;
    }
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
  const session = readAuthSession();
  if (session?.user.role === 'LOCAL_DEMO') return '';
  return session?.accessToken || env?.VITE_BUSINESS_API_TOKEN?.trim() || '';
}

export function isLocalDemoSession(session: AuthSession | null = readAuthSession()): boolean {
  return session?.user.role === 'LOCAL_DEMO';
}

export function sessionAuthorizationHeaders(): Record<string, string> {
  const token = readAuthSession()?.accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${authApiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...sessionAuthorizationHeaders(),
        ...init.headers,
      },
    });
  } catch {
    throw new Error('无法连接服务，请确认后端已启动。');
  }
  const payload = await readApiEnvelope<T>(response);
  if (!response.ok) throw new Error(payload?.message || `请求失败（${response.status}）`);
  if (!payload) throw new Error('服务返回了无法识别的响应，请稍后重试。');
  return payload.data;
}

export async function apiDownload(path: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${authApiBaseUrl}${path}`, {
      headers: sessionAuthorizationHeaders(),
    });
  } catch {
    throw new Error('无法连接服务，请确认后端已启动。');
  }
  if (!response.ok) {
    const payload = await readApiEnvelope<unknown>(response);
    throw new Error(payload?.message || `文件读取失败（${response.status}）`);
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
  const payload = await readApiEnvelope<T>(response);
  if (!response.ok) throw new Error(payload?.message || `登录请求失败（${response.status}），请稍后重试。`);
  if (!payload) throw new Error('登录服务返回了无法识别的响应，请稍后重试。');
  return payload.data;
}
