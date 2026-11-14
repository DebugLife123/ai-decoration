import { expect, test, vi } from "vitest";
import { configureAssetStorePersistence, getAssetStorePersistence } from "../src/services/asset-store-persistence";

test("asset store waits for its host persistence adapter before hydrating", async () => {
    vi.resetModules();
    const persistence = await import("../src/services/asset-store-persistence");
    let ready = false;
    const adapter = {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => undefined),
        removeItem: vi.fn(async () => undefined),
        restoreAssets: vi.fn(async (assets: never[]) => assets),
    };
    const pending = persistence.getAssetStorePersistence().then((value) => { ready = true; return value; });
    await Promise.resolve();
    expect(ready).toBe(false);
    persistence.configureAssetStorePersistence(adapter);
    await expect(pending).resolves.toBe(adapter);
});

test("configured persistence adapter is returned directly", async () => {
    const adapter = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), restoreAssets: vi.fn() };
    configureAssetStorePersistence(adapter);
    await expect(getAssetStorePersistence()).resolves.toBe(adapter);
});
