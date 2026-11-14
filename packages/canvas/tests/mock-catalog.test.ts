import { expect, test } from "vitest";
import { createMockCanvasProjectAssetCatalog } from "../src/services/api/canvas/mock-catalog";

const asset = {
    assetId: "asset-a",
    projectId: "project-a",
    name: "room.png",
    kind: "IMAGE" as const,
    mimeType: "image/png",
    width: 10,
    height: 8,
    bytes: 12,
    createdAt: "now",
    storageKey: "image:room",
};

test("Mock catalog reads and clones only the configured project assets", async () => {
    const catalog = createMockCanvasProjectAssetCatalog({ projectId: "project-a", assets: [asset] });
    const result = await catalog.readAll();
    result[0].name = "changed";
    expect(await catalog.readAll()).toEqual([asset]);
});

test("Mock catalog rejects cross-project and mismatched asset writes", async () => {
    const catalog = createMockCanvasProjectAssetCatalog({ projectId: "project-a" });
    await expect(catalog.save(asset.assetId, { ...asset, projectId: "project-b" })).rejects.toMatchObject({ code: "ASSET_PROJECT_MISMATCH" });
    await expect(catalog.save("other-id", asset)).rejects.toMatchObject({ code: "ASSET_ID_MISMATCH" });
    expect(() => createMockCanvasProjectAssetCatalog({ projectId: "project-a", assets: [{ ...asset, projectId: "project-b" }] })).toThrow("素材不属于当前项目");
});

test("Mock catalog exposes one-shot read/save/remove failures and permits retry", async () => {
    const catalog = createMockCanvasProjectAssetCatalog({ projectId: "project-a", failures: { save: new Error("save failed") } });
    await expect(catalog.save(asset.assetId, asset)).rejects.toThrow("save failed");
    await expect(catalog.save(asset.assetId, asset)).resolves.toBeUndefined();
    catalog.failNext("read", new Error("read failed"));
    await expect(catalog.readAll()).rejects.toThrow("read failed");
    await expect(catalog.readAll()).resolves.toEqual([asset]);
    catalog.failNext("remove", new Error("remove failed"));
    await expect(catalog.remove(asset.assetId)).rejects.toThrow("remove failed");
    await expect(catalog.remove(asset.assetId)).resolves.toBeUndefined();
    await expect(catalog.readAll()).resolves.toEqual([]);
});
