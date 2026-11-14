import type { StateStorage } from "zustand/middleware";

export type PluginStorePersistence = {
    storage: StateStorage;
};

let configured: PluginStorePersistence | undefined;
let resolveReady!: (adapter: PluginStorePersistence) => void;
const ready = new Promise<PluginStorePersistence>((resolve) => { resolveReady = resolve; });

export function configurePluginStorePersistence(adapter: PluginStorePersistence) {
    configured = adapter;
    resolveReady(adapter);
}

export function getPluginStorePersistence(): Promise<PluginStorePersistence> {
    return configured ? Promise.resolve(configured) : ready;
}
