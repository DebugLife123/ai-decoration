import { expect, test, vi } from "vitest";
import { cleanupAssetStore, configureAssetStoreCleanup } from "../src/services/asset-store-cleanup";

test("asset store delegates cleanup snapshots to the configured host", async () => {
    const hostCleanup = vi.fn(async (getUsedData: () => { projects: { id: string }[]; assets: unknown; extra?: unknown }) => {
        expect(getUsedData()).toEqual({ projects: [{ id: "project-a" }], assets: ["asset-a"], extra: "remove" });
    });
    configureAssetStoreCleanup(hostCleanup);
    const getUsedData = () => ({ projects: [{ id: "project-a" }], assets: ["asset-a"], extra: "remove" });
    await cleanupAssetStore(getUsedData);
    expect(hostCleanup).toHaveBeenCalledOnce();
    expect(hostCleanup).toHaveBeenCalledWith(getUsedData);
});
