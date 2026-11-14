import type { Asset } from "../stores/use-asset-store";

export type { Asset } from "../stores/use-asset-store";

export type AssetStorePersistence = {
    getItem(name: string): Promise<string | null>;
    setItem(name: string, value: string): Promise<void>;
    removeItem(name: string): Promise<void>;
    restoreAssets(assets: Asset[]): Promise<Asset[]>;
};

let persistence: AssetStorePersistence | undefined;
let resolveReady!: (adapter: AssetStorePersistence) => void;
const ready = new Promise<AssetStorePersistence>((resolve) => { resolveReady = resolve; });

export function configureAssetStorePersistence(adapter: AssetStorePersistence) {
    persistence = adapter;
    resolveReady(adapter);
}

export function getAssetStorePersistence() {
    return persistence ? Promise.resolve(persistence) : ready;
}
