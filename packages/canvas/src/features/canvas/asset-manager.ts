import type { CanvasLibraryItem } from "./asset-library";

// Catalog-local IDs are not project assetIds. The host owns persistence and media storage.
export type CanvasManagedAsset = CanvasLibraryItem & { category?: string; tags: string[] };

export type CanvasAssetManager = {
    list(): Promise<{ loading: boolean; items: CanvasManagedAsset[] }>;
    add(file: File, category: string): Promise<void>;
    remove(id: string): Promise<void>;
    subscribe?: (onChange: () => void) => () => void;
};
