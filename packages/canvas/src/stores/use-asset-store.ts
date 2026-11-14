import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { cleanupAssetStore } from "../services/asset-store-cleanup";
import { getAssetStorePersistence } from "../services/asset-store-persistence";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    category?: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    addAssets: (assets: Array<Omit<Asset, "id" | "createdAt" | "updatedAt">>) => string[];
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    updateAssets: (ids: string[], patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    removeAssets: (ids: string[]) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const persistence = await getAssetStorePersistence();
        const value = await persistence.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.assets = await persistence.restoreAssets(parsed.state.assets);
        return parsed;
    },
    setItem: async (name, value) => (await getAssetStorePersistence()).setItem(name, JSON.stringify(value)),
    removeItem: async (name) => (await getAssetStorePersistence()).removeItem(name),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            assets: [],
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                return id;
            },
            addAssets: (items) => {
                if (!items.length) return [];
                const now = new Date().toISOString();
                const prepared = items.map((asset) => ({ ...asset, id: nanoid(), createdAt: now, updatedAt: now } as Asset));
                set((state) => ({ assets: [...prepared, ...state.assets] }));
                return prepared.map((asset) => asset.id);
            },
            updateAsset: (id, patch) =>
                set((state) => ({
                    assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
                })),
            updateAssets: (ids, patch) => {
                const idSet = new Set(ids);
                const now = new Date().toISOString();
                set((state) => ({ assets: state.assets.map((asset) => (idSet.has(asset.id) ? ({ ...asset, ...patch, updatedAt: now } as Asset) : asset)) }));
            },
            removeAsset: (id) =>
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    return { assets };
                }),
            removeAssets: (ids) => {
                const idSet = new Set(ids.filter(Boolean));
                if (!idSet.size) return;
                set((state) => {
                    const assets = state.assets.filter((asset) => !idSet.has(asset.id));
                    get().cleanupImages({ assets });
                    return { assets };
                });
            },
            replaceAssets: (assets) => set({ assets }),
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("./canvas/use-canvas-store");
                    if (!get().hydrated || !useCanvasStore.getState().hydrated) return;
                    const usedData = () => ({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupAssetStore(usedData);
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets }) as StorageValue<AssetStore>["state"],
            onRehydrateStorage: () => () => {
                useAssetStore.setState({ hydrated: true });
            },
        },
    ),
);
