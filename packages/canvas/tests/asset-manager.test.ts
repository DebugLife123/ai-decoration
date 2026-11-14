import { readFileSync } from "node:fs";
import { beforeEach, expect, test, vi } from "vitest";
import type { Asset } from "../src/stores/use-asset-store";

const mocks = vi.hoisted(() => ({
    state: { hydrated: false, assets: [] as Asset[], addAsset: vi.fn(), removeAsset: vi.fn() },
    unsubscribe: vi.fn(), subscribe: vi.fn(), image: vi.fn(), media: vi.fn(),
}));
vi.mock("@/stores/use-asset-store", () => ({ useAssetStore: { getState: () => mocks.state, subscribe: mocks.subscribe } }));
vi.mock("@/stores/use-workspace-store", () => ({ useWorkspaceStore: { getState: () => ({ hydrated: true, workspaces: [] }) } }));
vi.mock("@/lib/workspace-to-insert", () => import("../src/lib/workspace-to-insert"));
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("@/services/image-storage", () => ({ uploadImage: mocks.image }));
vi.mock("@/services/file-storage", () => ({ uploadMediaFile: mocks.media }));

import { localCanvasAssetManager as manager } from "../../../web/src/services/api/canvas/asset-library";

beforeEach(() => {
    vi.resetAllMocks();
    mocks.state.hydrated = false;
    mocks.state.assets = [];
    mocks.subscribe.mockReturnValue(mocks.unsubscribe);
});

test("lists the global catalog with hydration, categories and tags without inventing project ownership", async () => {
    expect(await manager.list()).toEqual({ loading: true, items: [] });
    mocks.state.hydrated = true;
    mocks.state.assets = [{ id: "global-1", kind: "text", title: "要求", coverUrl: "", category: "参考图", tags: ["客厅"], createdAt: "fixture", updatedAt: "fixture", data: { content: "保留采光" } }];
    const result = await manager.list();
    expect(result.loading).toBe(false);
    expect(result.items[0]).toMatchObject({ id: "global-1", category: "参考图", tags: ["客厅"], payload: { kind: "text", content: "保留采光" } });
    expect(result.items[0]).not.toHaveProperty("projectId");
    expect(result.items[0]).not.toHaveProperty("assetId");
});

test("uploads images before adding the original local reference and category", async () => {
    const file = new File(["fixture"], "room.png", { type: "image/png" });
    mocks.image.mockResolvedValue({ url: "blob:room", storageKey: "image-key", width: 960, height: 640, bytes: 7, mimeType: "image/png" });
    await manager.add(file, "房间照片");
    expect(mocks.image).toHaveBeenCalledWith(file);
    expect(mocks.state.addAsset).toHaveBeenCalledWith(expect.objectContaining({ kind: "image", category: "房间照片", title: "room.png", data: expect.objectContaining({ storageKey: "image-key", width: 960, height: 640 }) }));
    expect(mocks.media).not.toHaveBeenCalled();
});

test("keeps video storage and does not save failed or unsupported files", async () => {
    mocks.media.mockResolvedValue({ url: "blob:video", storageKey: "video-key", bytes: 4, mimeType: "video/mp4" });
    const video = new File(["clip"], "room.mp4", { type: "video/mp4" });
    await manager.add(video, "参考图");
    expect(mocks.media).toHaveBeenCalledWith(video, "video");
    expect(mocks.state.addAsset).toHaveBeenCalledWith(expect.objectContaining({ kind: "video", data: expect.objectContaining({ storageKey: "video-key", width: 0, height: 0 }) }));
    mocks.state.addAsset.mockClear();
    mocks.image.mockRejectedValue(new Error("read failed"));
    await expect(manager.add(new File([], "bad.png", { type: "image/png" }), "蒙版")).rejects.toThrow("read failed");
    await expect(manager.add(new File([], "note.txt", { type: "text/plain" }), "蒙版")).rejects.toThrow("canvas.sidePanel.mediaOnly");
    expect(mocks.state.addAsset).not.toHaveBeenCalled();
});

test("delegates removal and subscription cleanup; errors remain visible to the panel", async () => {
    await manager.remove("global-1");
    expect(mocks.state.removeAsset).toHaveBeenCalledWith("global-1");
    mocks.state.removeAsset.mockImplementation(() => { throw new Error("remove failed"); });
    await expect(manager.remove("global-1")).rejects.toThrow("remove failed");
    const listener = vi.fn();
    const unsubscribe = manager.subscribe!(listener);
    expect(mocks.subscribe).toHaveBeenCalledWith(listener);
    unsubscribe();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});

test("side panel no longer imports the local catalog or media storage", () => {
    const source = readFileSync(new URL("../src/components/canvas/canvas-side-panel.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/use-asset-store|services\/image-storage|services\/file-storage/);
});
