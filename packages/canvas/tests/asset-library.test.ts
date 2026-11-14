import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { CANVAS_ASSET_DRAG_MIME, createProjectAssetLibrary, parseCanvasAssetDragData, serializeCanvasAssetDragData } from "../src/features/canvas/asset-library";
import type { CanvasAsset } from "../src/features/canvas/contracts";

const asset: CanvasAsset = { assetId: "image-1", projectId: "project-1", name: "room.png", kind: "IMAGE", mimeType: "image/png", url: "data:image/png;base64,fixture", width: 960, height: 640, createdAt: "fixture" };

describe("Project asset library", () => {
    test("serializes only project and asset identity for drag-and-drop", () => {
        const value = serializeCanvasAssetDragData({ projectId: asset.projectId, assetId: asset.assetId });
        expect(parseCanvasAssetDragData(value)).toEqual({ projectId: asset.projectId, assetId: asset.assetId });
        expect(parseCanvasAssetDragData("bad payload")).toBeNull();
        expect(CANVAS_ASSET_DRAG_MIME).toContain("infinite-canvas");
    });
    test("queries only its project and keeps identity and image metadata for insertion", async () => {
        const listAssets = vi.fn().mockResolvedValue([asset]);
        const [source] = await createProjectAssetLibrary({ listAssets }, asset.projectId).list();
        expect(listAssets).toHaveBeenCalledWith(asset.projectId);
        expect(source.items[0]).toMatchObject({ id: asset.assetId, cover: asset.url, payload: { kind: "image", dataUrl: asset.url, asset } });
        expect(source.items[0].payload).not.toHaveProperty("storageKey");
    });

    test("rejects assets from another project instead of exposing them", async () => {
        await expect(createProjectAssetLibrary({ listAssets: async () => [asset] }, "other-project").list()).rejects.toThrow("素材不属于当前项目");
    });

    test("video entries keep their media identity without using a video URL as an image cover", async () => {
        const video = { ...asset, kind: "VIDEO" as const, name: "room.mp4", mimeType: "video/mp4", url: "blob:video", storageKey: "video:fixture", bytes: 42, durationMs: 1500 };
        const [source] = await createProjectAssetLibrary({ listAssets: async () => [asset, video] }, asset.projectId).list();
        expect(source.items[1]).toMatchObject({ cover: "", payload: { kind: "video", url: video.url, storageKey: video.storageKey, width: 960, height: 640, asset: video } });
        await expect(createProjectAssetLibrary({ listAssets: async () => [video] }, "other").list()).rejects.toThrow("素材不属于当前项目");
    });

    test("audio entries preserve project identity and duration without image-only fields", async () => {
        const { width: _width, height: _height, ...base } = asset;
        const audio = { ...base, kind: "AUDIO" as const, name: "narration.mp3", mimeType: "audio/mpeg", url: "blob:audio", storageKey: "audio:fixture", bytes: 42, durationMs: 1500 };
        const [source] = await createProjectAssetLibrary({ listAssets: async () => [audio] }, asset.projectId).list();
        expect(source.items[0]).toMatchObject({ id: audio.assetId, cover: "", payload: { kind: "audio", title: audio.name, asset: audio } });
        expect(source.items[0].payload).not.toHaveProperty("width");
        await expect(createProjectAssetLibrary({ listAssets: async () => [audio] }, "other").list()).rejects.toThrow("素材不属于当前项目");
    });

    test("does not cache empty lists or swallow failures; a later query can retry", async () => {
        const listAssets = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]).mockResolvedValueOnce([asset]);
        const library = createProjectAssetLibrary({ listAssets }, asset.projectId);
        await expect(library.list()).rejects.toThrow("offline");
        expect((await library.list())[0].items).toEqual([]);
        expect((await library.list())[0].items).toHaveLength(1);
    });

    test("exposes deletion only when the project host provides a delete command", async () => {
        const remove = vi.fn().mockResolvedValue(undefined);
        const [source] = await createProjectAssetLibrary({ listAssets: async () => [asset], deleteAsset: remove }, asset.projectId).list();
        expect(source.remove).toBeTypeOf("function");
        await source.remove!(asset.assetId);
        expect(remove).toHaveBeenCalledWith(asset.projectId, asset.assetId);
        const [readOnlySource] = await createProjectAssetLibrary({ listAssets: async () => [asset] }, asset.projectId).list();
        expect(readOnlySource.remove).toBeUndefined();
    });

    test("picker imports no legacy library stores or conversion helpers", () => {
        const filename = new URL("../src/components/canvas/asset-picker-modal.tsx", import.meta.url);
        const source = ts.createSourceFile(filename.pathname, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
        const imports = source.statements.filter(ts.isImportDeclaration).map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
        expect(imports.filter((value) => /use-asset-store|use-workspace-store|workspace-to-insert/.test(value))).toEqual([]);
    });
});
