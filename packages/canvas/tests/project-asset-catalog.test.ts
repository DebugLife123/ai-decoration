import { expect, test, vi } from "vitest";
import { createCanvasProjectAssetCatalog } from "../src/services/project-asset-catalog";
import { configureCanvasProjectAssetCatalog, getCanvasProjectAssetCatalog } from "../src/services/canvas-project-asset-catalog";

const localStore = vi.hoisted(() => {
    const values = new Map<string, unknown>();
    return {
        config: undefined as unknown,
        values,
        iterate: vi.fn(async (callback: (value: unknown, key: string) => void) => values.forEach((value, key) => callback(value, key))),
        setItem: vi.fn(async (key: string, value: unknown) => { values.set(key, value); return value; }),
        removeItem: vi.fn(async (key: string) => { values.delete(key); }),
    };
});
vi.mock("../../../web/src/services/localforage", () => ({ createLocalForageStore: (storeName: string) => { localStore.config = storeName; return localStore; } }));

import { localCanvasProjectAssetCatalog } from "../../../web/src/services/api/canvas/local-catalog";

test("catalog adapter maps local store operations to typed read/save/remove commands", async () => {
    const values = new Map<string, unknown>([["asset-a", { assetId: "asset-a" }]]);
    const store = {
        iterate: vi.fn(async (callback: (value: unknown, key: string) => void) => values.forEach((value, key) => callback(value, key))),
        setItem: vi.fn(async (key: string, value: unknown) => { values.set(key, value); return value; }),
        removeItem: vi.fn(async (key: string) => { values.delete(key); }),
    };
    const catalog = createCanvasProjectAssetCatalog(store);
    expect(await catalog.readAll()).toEqual([{ assetId: "asset-a" }]);
    const asset = { assetId: "asset-b", projectId: "project-a", name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", width: 1, height: 1, bytes: 1, createdAt: "now", storageKey: "image:b" };
    await catalog.save(asset.assetId, asset);
    await catalog.remove(asset.assetId);
    expect(store.setItem).toHaveBeenCalledWith("asset-b", asset);
    expect(store.removeItem).toHaveBeenCalledWith("asset-b");
    expect(values.has("asset-b")).toBe(false);
});

test("local catalog is an explicit adapter separate from the reusable catalog factory", async () => {
    expect(localCanvasProjectAssetCatalog).toEqual({ readAll: expect.any(Function), save: expect.any(Function), remove: expect.any(Function) });
    expect(localStore.config).toBe("canvas_project_assets");
    const asset = { assetId: "asset-a", projectId: "project-a", name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", width: 1, height: 1, bytes: 1, createdAt: "now", storageKey: "image:a" };
    await localCanvasProjectAssetCatalog.save(asset.assetId, asset);
    await expect(localCanvasProjectAssetCatalog.readAll()).resolves.toEqual([asset]);
    await localCanvasProjectAssetCatalog.remove(asset.assetId);
    expect(localStore.values.has(asset.assetId)).toBe(false);
});

test("shared project asset catalog requires explicit host registration", () => {
    expect(() => getCanvasProjectAssetCatalog()).toThrow("画布项目素材目录宿主尚未配置");
    const adapter = createCanvasProjectAssetCatalog(localStore);
    configureCanvasProjectAssetCatalog(adapter);
    expect(getCanvasProjectAssetCatalog()).toBe(adapter);
});
