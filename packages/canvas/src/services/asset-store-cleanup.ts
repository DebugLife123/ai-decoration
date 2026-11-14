export type AssetStoreCleanupData = { projects: { id: string }[]; assets: unknown; extra?: unknown };
export type AssetStoreCleanup = (getUsedData: () => AssetStoreCleanupData) => Promise<void> | void;

let cleanup: AssetStoreCleanup = () => undefined;

export function configureAssetStoreCleanup(hostCleanup: AssetStoreCleanup) {
    cleanup = hostCleanup;
}

export function cleanupAssetStore(getUsedData: () => AssetStoreCleanupData) {
    return cleanup(getUsedData);
}
