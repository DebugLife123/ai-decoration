import { expect, test, vi } from "vitest";
import { createCanvasHttpAssetCatalog } from "../src/services/api/canvas/http-asset-catalog";

const projectId = "project/1";
const asset = { assetId: "asset-1", projectId, name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", url: "data:image/png;base64,room", width: 10, height: 8, createdAt: "now" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("HTTP asset catalog reuses the project-scoped Canvas asset contract", async () => {
    const transport = vi.fn().mockResolvedValueOnce(response([asset])).mockResolvedValueOnce(response(asset));
    const catalog = createCanvasHttpAssetCatalog({ baseUrl: "https://canvas.example/", fetch: transport });
    await expect(catalog.listAssets(projectId)).resolves.toEqual([asset]);
    await expect(catalog.getAsset(projectId, asset.assetId)).resolves.toEqual(asset);
    expect(transport.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
        ["https://canvas.example/api/v1/projects/project%2F1/assets", "GET"],
        ["https://canvas.example/api/v1/projects/project%2F1/assets/asset-1", "GET"],
    ]);
});

test("HTTP asset catalog preserves response identity validation", async () => {
    const catalog = createCanvasHttpAssetCatalog({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...asset, projectId: "project-2" })) });
    await expect(catalog.getAsset(projectId, asset.assetId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
