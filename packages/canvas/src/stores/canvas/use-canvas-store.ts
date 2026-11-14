import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { getCanvasStorePersistence } from "../../services/canvas-store-persistence";
import { createCanvasState, type CanvasStore } from "./canvas-state";
export * from "./canvas-state";

const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "projects" | "deletedProjects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await (await getCanvasStorePersistence()).storage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects && queuedPersistState.deletedProjects === nextState.deletedProjects) return;
        queuedPersistState = nextState;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void getCanvasStorePersistence().then((persistence) => persistence.storage.setItem(name, JSON.stringify(value)));
        }, 400);
    },
    removeItem: async (name) => { await (await getCanvasStorePersistence()).storage.removeItem(name); },
};

export const useCanvasStore = create<CanvasStore>()(
    persist(createCanvasState, {
        name: CANVAS_STORE_KEY,
        storage: canvasStorage,
        partialize: (state) =>
            ({
                projects: state.projects,
                deletedProjects: state.deletedProjects,
            }) as StorageValue<CanvasStore>["state"],
        onRehydrateStorage: () => () => {
            useCanvasStore.setState({ hydrated: true });
        },
    }),
);
