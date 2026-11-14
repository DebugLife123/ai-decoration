export type ProviderImageReference = {
    name: string;
    type?: string;
    dataUrl?: string;
    url?: string;
    storageKey?: string;
};

export type ProviderMediaReference = {
    name: string;
    type?: string;
    url?: string;
    storageKey?: string;
};

export type ProviderUploadedMedia = {
    url: string;
    storageKey: string;
    bytes: number;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
};

export type ProviderMediaPersistence = {
    readImage: (image: ProviderImageReference, signal?: AbortSignal) => Promise<string>;
    readMedia: (reference: ProviderMediaReference, signal?: AbortSignal) => Promise<Blob | null>;
    resolveMedia: (storageKey?: string, fallback?: string) => Promise<string | null>;
    uploadMedia: (input: string | Blob, prefix?: string) => Promise<ProviderUploadedMedia>;
};

let configured: ProviderMediaPersistence | undefined;
let resolveReady!: (adapter: ProviderMediaPersistence) => void;
const ready = new Promise<ProviderMediaPersistence>((resolve) => { resolveReady = resolve; });

export function configureProviderMediaPersistence(adapter: ProviderMediaPersistence) {
    configured = adapter;
    resolveReady(adapter);
}

export function getProviderMediaPersistence(): Promise<ProviderMediaPersistence> {
    return configured ? Promise.resolve(configured) : ready;
}

export async function readProviderMedia(reference: ProviderMediaReference, signal?: AbortSignal): Promise<Blob> {
    signal?.throwIfAborted();
    const persistence = await getProviderMediaPersistence();
    const stored = await persistence.readMedia(reference, signal);
    signal?.throwIfAborted();
    if (stored) return stored;
    const url = await persistence.resolveMedia(reference.storageKey, reference.url);
    signal?.throwIfAborted();
    if (!url) throw new Error(`无法读取参考素材：${reference.name}`);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`无法读取参考素材：${reference.name}`);
    signal?.throwIfAborted();
    return response.blob();
}
