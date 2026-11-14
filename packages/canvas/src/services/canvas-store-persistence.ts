import type { StateStorage } from "zustand/middleware";

export type CanvasStorePersistence = {
    storage: StateStorage;
};

let configured: CanvasStorePersistence | undefined;
let resolveReady!: (adapter: CanvasStorePersistence) => void;
const ready = new Promise<CanvasStorePersistence>((resolve) => { resolveReady = resolve; });

export function configureCanvasStorePersistence(adapter: CanvasStorePersistence) {
    configured = adapter;
    resolveReady(adapter);
}

export function getCanvasStorePersistence(): Promise<CanvasStorePersistence> {
    return configured ? Promise.resolve(configured) : ready;
}
