import { apiBaseUrl } from './apiBase';

export interface PlatformStyleCatalogItem {
  styleKey: string;
  styleName: string;
  prompt: string;
  priceLowPerSqm: number | null;
  priceHighPerSqm: number | null;
  materialFactor: number;
}

type Envelope<T> = { data?: T };
let cache: PlatformStyleCatalogItem[] | null = null;

export function clearStyleDirectoryCache() { cache = null; }

export async function loadStyleDirectory(): Promise<PlatformStyleCatalogItem[]> {
  if (cache) return cache;
  const response = await fetch(`${apiBaseUrl}/api/v1/styles/catalog`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`风格目录加载失败（${response.status}）`);
  const payload = await response.json() as Envelope<PlatformStyleCatalogItem[]>;
  cache = Array.isArray(payload.data) ? payload.data : [];
  return cache;
}
