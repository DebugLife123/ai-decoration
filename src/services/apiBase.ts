import { authApiBaseUrl } from './authSession';

export const apiBaseUrl = authApiBaseUrl;
export const apiBaseUrlConfigured = Boolean(import.meta.env?.VITE_BUSINESS_API_URL?.trim());
export function apiUrl(path: string) { return `${apiBaseUrl}${path}`; }
