import { canvasModelName } from "../features/canvas/model-resolution";

export type ProviderProxySettings = { proxyEnabled?: boolean; proxyUrl?: string };

export function modelOptionName(value: string) {
    return canvasModelName(value);
}

export function buildProviderApiUrl(baseUrl: string, path: string, proxy?: ProviderProxySettings) {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return withProviderProxy(`${apiBaseUrl}${path}`, proxy);
}

export function withProviderProxy(url: string, proxy?: ProviderProxySettings) {
    if (!proxy?.proxyEnabled || !/^https?:\/\//i.test(url)) return url;
    const base = (proxy.proxyUrl || "").trim().replace(/\/+$/, "");
    if (!base) return url;
    const normalizedBase = /^https?:\/\//i.test(base) ? base : `http://${base}`;
    if (url.startsWith(`${normalizedBase}/`)) return url;
    return `${normalizedBase}/${url}`;
}
