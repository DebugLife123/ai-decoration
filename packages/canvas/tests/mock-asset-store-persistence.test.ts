import { expect, test } from "vitest";
import { mockAssetStorePersistence } from "../../../apps/canvas-demo/src/asset-store-persistence";

test("demo asset-store persistence is memory-only and leaves assets untouched", async () => {
    const value = "serialized demo store";
    await mockAssetStorePersistence.setItem("demo-assets", value);
    await expect(mockAssetStorePersistence.getItem("demo-assets")).resolves.toBe(value);
    const assets = [{ id: "demo", kind: "image" as const, title: "sample", coverUrl: "data:image/png;base64,AA==", tags: [], createdAt: "now", updatedAt: "now", data: { dataUrl: "data:image/png;base64,AA==", width: 1, height: 1, bytes: 1, mimeType: "image/png" } }];
    await expect(mockAssetStorePersistence.restoreAssets(assets)).resolves.toEqual(assets);
    await mockAssetStorePersistence.removeItem("demo-assets");
    await expect(mockAssetStorePersistence.getItem("demo-assets")).resolves.toBeNull();
});
