import { expect, test } from "vitest";
import { configureCanvasStorePersistence, getCanvasStorePersistence, type CanvasStorePersistence } from "../src/services/canvas-store-persistence";
import { configurePluginStorePersistence, getPluginStorePersistence, type PluginStorePersistence } from "../src/services/plugin-store-persistence";

const storage = { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined };

test("canvas store persistence waits for an explicitly configured host", async () => {
    const adapter: CanvasStorePersistence = { storage };
    const pending = getCanvasStorePersistence();
    configureCanvasStorePersistence(adapter);
    await expect(pending).resolves.toBe(adapter);
    await expect(getCanvasStorePersistence()).resolves.toBe(adapter);
});

test("plugin store persistence exposes the configured host storage", async () => {
    const adapter: PluginStorePersistence = { storage };
    const pending = getPluginStorePersistence();
    configurePluginStorePersistence(adapter);
    await expect(pending).resolves.toBe(adapter);
    await expect(getPluginStorePersistence()).resolves.toBe(adapter);
});
