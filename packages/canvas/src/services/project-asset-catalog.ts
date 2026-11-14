import type { CanvasImportedAudio, CanvasImportedImage, CanvasImportedVideo } from "../features/canvas/contracts";

export type CanvasProjectAssetRecord = (Omit<CanvasImportedImage, "url" | "storageKey"> | Omit<CanvasImportedVideo, "url" | "storageKey"> | Omit<CanvasImportedAudio, "url" | "storageKey">) & { storageKey: string };

type CatalogStore = {
    iterate<T, R>(callback: (value: T, key: string) => R): Promise<R>;
    setItem<T>(key: string, value: T): Promise<T>;
    removeItem(key: string): Promise<void>;
};

export type CanvasProjectAssetCatalog = {
    readAll(): Promise<CanvasProjectAssetRecord[]>;
    save(assetId: string, asset: CanvasProjectAssetRecord): Promise<void>;
    remove(assetId: string): Promise<void>;
};

export function createCanvasProjectAssetCatalog(store: CatalogStore): CanvasProjectAssetCatalog {
    return {
        async readAll() {
            const assets: CanvasProjectAssetRecord[] = [];
            await store.iterate<CanvasProjectAssetRecord, void>((asset) => { assets.push(asset); });
            return assets;
        },
        async save(assetId, asset) {
            await store.setItem(assetId, asset);
        },
        remove: (assetId) => store.removeItem(assetId),
    };
}

