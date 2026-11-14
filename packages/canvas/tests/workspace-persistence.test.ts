import { expect, test } from "vitest";
import { configureWorkspacePersistence, getWorkspacePersistence, type WorkspacePersistence } from "../../../web/src/services/workspace-persistence";

test("workspace persistence waits for the host adapter before hydration", async () => {
    const adapter: WorkspacePersistence = {
        storage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
        cloneAssetDraft: async (asset) => asset as never,
        resolveAssetUrls: async (asset) => asset,
        deleteAssets: async () => undefined,
    };
    const pending = getWorkspacePersistence();
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    configureWorkspacePersistence(adapter);
    await expect(pending).resolves.toBe(adapter);
    await expect(getWorkspacePersistence()).resolves.toBe(adapter);
});
