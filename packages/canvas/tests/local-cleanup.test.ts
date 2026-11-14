import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    cleanup: vi.fn(),
    cleanupImages: vi.fn(),
    cleanupMedia: vi.fn(),
    projects: [{ id: "project-a" }],
    assets: [{ id: "asset-a" }],
}));

vi.mock("@infinite-canvas/core/project-assets", () => ({ cleanupProjectAssets: mocks.cleanup }));
vi.mock("../../../web/src/services/api/canvas/local-catalog", () => ({ localCanvasProjectAssetCatalog: { id: "local-catalog" } }));
vi.mock("../../../web/src/services/api/canvas/local-project-asset-storage", () => ({ localCanvasProjectAssetStorage: { cleanupImages: mocks.cleanupImages, cleanupMedia: mocks.cleanupMedia } }));
vi.mock("@/stores/canvas/use-canvas-store", () => ({ useCanvasStore: { getState: () => ({ projects: mocks.projects }) } }));
vi.mock("@infinite-canvas/core/stores/asset", () => ({ useAssetStore: { getState: () => ({ assets: mocks.assets }) } }));

import { cleanupLocalCanvasAssets, cleanupLocalCanvasMedia } from "../../../web/src/services/api/canvas/local-cleanup";

beforeEach(() => { vi.resetAllMocks(); mocks.cleanup.mockResolvedValue(undefined); });

test("local cleanup service forwards a live project and asset snapshot with the typed context", async () => {
    const context = { projectId: "project-a", reason: "node-removed" as const, extra: { nodeId: "node-a" } };
    await cleanupLocalCanvasMedia(context);
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.cleanup.mock.calls[0][1]).toEqual({ cleanupImages: mocks.cleanupImages, cleanupMedia: mocks.cleanupMedia });
    expect(mocks.cleanup.mock.calls[0][2]).toEqual({ id: "local-catalog" });
    const readUsedData = mocks.cleanup.mock.calls[0][0] as () => unknown;
    expect(readUsedData()).toEqual({ projects: mocks.projects, assets: mocks.assets, extra: context });
});

test("local cleanup service logs a rejected cleanup promise without leaking it to the editor", async () => {
    const error = new Error("cleanup failed");
    mocks.cleanup.mockRejectedValueOnce(error);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(cleanupLocalCanvasMedia({ projectId: "project-a", reason: "project-deleted" })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("画布本地媒体清理失败", error);
    errorSpy.mockRestore();
});

test("asset store cleanup adapter consumes the provided live snapshot getter", async () => {
    const getUsedData = () => ({ projects: mocks.projects, assets: mocks.assets, extra: { assets: [] } });
    await cleanupLocalCanvasAssets(getUsedData);
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.cleanup.mock.calls[0][0]()).toEqual(getUsedData());
    expect(mocks.cleanup.mock.calls[0][1]).toEqual({ cleanupImages: mocks.cleanupImages, cleanupMedia: mocks.cleanupMedia });
    expect(mocks.cleanup.mock.calls[0][2]).toEqual({ id: "local-catalog" });
});
