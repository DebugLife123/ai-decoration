import { afterEach, expect, test, vi } from "vitest";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const mocks = vi.hoisted(() => ({ createZip: vi.fn(), saveAs: vi.fn() }));
vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../src/lib/zip", () => ({ createZip: mocks.createZip }));
vi.mock("file-saver", () => ({ saveAs: mocks.saveAs }));

import { exportCanvasNodes, exportCanvasProjects, exportCanvasResults } from "../src/lib/canvas/canvas-export";

afterEach(() => vi.resetAllMocks());

test("project export reads every storage key through its host and skips missing blobs", async () => {
    mocks.createZip.mockResolvedValue(new Blob(["zip"]));
    const readMedia = vi.fn(async (_projectId: string, reference: { storageKey?: string }) => reference.storageKey === "image:room" ? new Blob(["image"], { type: "image/png" }) : null);
    const project = { id: "project-a", nodes: [{ metadata: { storageKey: "image:room" } }, { metadata: { storageKey: "video:missing" } }] };
    await exportCanvasProjects([project as never], "project", readMedia);
    expect(readMedia).toHaveBeenCalledTimes(2);
    expect(readMedia).toHaveBeenCalledWith("project-a", { name: "image:room", storageKey: "image:room" });
    expect(mocks.createZip.mock.calls[0][0].map((file: { name: string }) => file.name)).toEqual(["projects.json", "projects/project-a/files/image_room.png"]);
    expect(mocks.saveAs).toHaveBeenCalledOnce();
});

test("selected node export delegates stored media reads to the active project host", async () => {
    mocks.createZip.mockResolvedValue(new Blob(["zip"]));
    const readMedia = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const node = { id: "image", type: CanvasNodeType.Image, title: "客厅", position: { x: 0, y: 0 }, width: 100, height: 80, metadata: { storageKey: "image:room", assetId: "asset-a", mimeType: "image/png" } } as CanvasNodeData;
    await exportCanvasNodes([node], "selection", "project-a", readMedia);
    expect(readMedia).toHaveBeenCalledWith("project-a", { name: "客厅", type: "image/png", url: undefined, storageKey: "image:room", assetId: "asset-a" });
    expect(mocks.createZip.mock.calls[0][0].map((file: { name: string }) => file.name)).toEqual(["客厅.png"]);
});

test("selected node data URL export also delegates media reads to the active project host", async () => {
    mocks.createZip.mockResolvedValue(new Blob(["zip"]));
    const readMedia = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const node = { id: "image", type: CanvasNodeType.Image, title: "原图", position: { x: 0, y: 0 }, width: 100, height: 80, metadata: { content: "data:image/png;base64,eA==", mimeType: "image/png" } } as CanvasNodeData;
    await exportCanvasNodes([node], "selection", "project-a", readMedia);
    expect(readMedia).toHaveBeenCalledWith("project-a", expect.objectContaining({ name: "原图", url: node.metadata.content, dataUrl: node.metadata.content }));
});

test("result export reads registered assets through the host instead of package-local storage", async () => {
    mocks.createZip.mockResolvedValue(new Blob(["zip"]));
    const readMedia = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const node = {
        id: "result", type: CanvasNodeType.Image, title: "生成方案", position: { x: 0, y: 0 }, width: 100, height: 80,
        metadata: { generationType: "image", images: [{ id: "result-1", status: "success", content: "data:image/png;base64,eA==", assetId: "asset-result", storageKey: "objects/result", mimeType: "image/png" }] },
    } as CanvasNodeData;
    await expect(exportCanvasResults([node], "results", "project-a", readMedia)).resolves.toEqual({ exportedCount: 1, skippedCount: 0 });
    expect(readMedia).toHaveBeenCalledWith("project-a", expect.objectContaining({ name: "生成方案-1", assetId: "asset-result", storageKey: "objects/result" }));
});

test("result export delegates inline data URL reads to the active project host", async () => {
    mocks.createZip.mockResolvedValue(new Blob(["zip"]));
    const readMedia = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const content = "data:image/png;base64,eA==";
    const node = { id: "result", type: CanvasNodeType.Image, title: "方案", position: { x: 0, y: 0 }, width: 100, height: 80, metadata: { generationType: "image", status: "success", content } } as CanvasNodeData;
    await expect(exportCanvasResults([node], "results", "project-a", readMedia)).resolves.toEqual({ exportedCount: 1, skippedCount: 0 });
    expect(readMedia).toHaveBeenCalledWith("project-a", expect.objectContaining({ name: "方案", url: content, dataUrl: content }));
});

test("result export includes task-linked result assets without legacy generation metadata", async () => {
    mocks.createZip.mockResolvedValue(new Blob(["zip"]));
    const readMedia = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const node = {
        id: "asset-result", type: CanvasNodeType.Image, title: "Mock 编辑结果", position: { x: 0, y: 0 }, width: 100, height: 80,
        metadata: { status: "success", content: "data:image/png;base64,eA==", assetId: "asset-result", taskId: "task-1", versionId: "version-1" },
    } as CanvasNodeData;

    await expect(exportCanvasResults([node], "results", "project-a", readMedia)).resolves.toEqual({ exportedCount: 1, skippedCount: 0 });
    expect(readMedia).toHaveBeenCalledWith("project-a", expect.objectContaining({ assetId: "asset-result" }));
    const files = mocks.createZip.mock.calls[0][0] as Array<{ name: string; data: BlobPart }>;
    const manifest = JSON.parse(String(files[0].data));
    expect(manifest).toMatchObject({ app: "infinite-canvas-results", version: 1, projectId: "project-a", skippedCount: 0 });
    expect(manifest.items).toEqual([{ name: "Mock 编辑结果", path: "Mock 编辑结果.png", mimeType: "image/png", taskId: "task-1", assetId: "asset-result", versionId: "version-1" }]);
});

test("result export excludes ordinary uploaded image, video and audio assets", async () => {
    const readMedia = vi.fn().mockResolvedValue(new Blob(["media"]));
    const nodes = [
        { id: "image", type: CanvasNodeType.Image, title: "上传图片", metadata: { content: "data:image/png;base64,eA==", assetId: "asset-image" } },
        { id: "video", type: CanvasNodeType.Video, title: "上传视频", metadata: { content: "data:video/mp4;base64,eA==", assetId: "asset-video" } },
        { id: "audio", type: CanvasNodeType.Audio, title: "上传音频", metadata: { content: "data:audio/mpeg;base64,eA==", assetId: "asset-audio" } },
    ].map((node) => ({ ...node, position: { x: 0, y: 0 }, width: 100, height: 80, metadata: { status: "success", ...node.metadata } } as CanvasNodeData));

    await expect(exportCanvasResults(nodes, "results", "project-a", readMedia)).resolves.toEqual({ exportedCount: 0, skippedCount: 0 });
    expect(readMedia).not.toHaveBeenCalled();
});

test("result export keeps manifest and duplicate result names unique case-insensitively", async () => {
    mocks.createZip.mockResolvedValue(new Blob(["zip"]));
    const readMedia = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const nodes = ["result-manifest", "Same Title", "same title"].map((title, index) => ({
        id: `result-${index}`, type: CanvasNodeType.Image, title, position: { x: 0, y: 0 }, width: 100, height: 80,
        metadata: { status: "success", content: "data:image/png;base64,eA==", taskId: `task-${index}`, generationType: "image" },
    } as CanvasNodeData));

    await expect(exportCanvasResults(nodes, "results", "project-a", readMedia)).resolves.toEqual({ exportedCount: 3, skippedCount: 0 });
    const files = mocks.createZip.mock.calls[0][0] as Array<{ name: string; data: BlobPart }>;
    expect(files.map((file) => file.name)).toEqual(["result-manifest.json", "result-manifest-1.png", "Same Title.png", "same title-1.png"]);
    const manifest = JSON.parse(String(files[0].data));
    expect(manifest.items.map((item: { path: string }) => item.path)).toEqual(files.slice(1).map((file) => file.name));
});

test("result export skips an unreadable successful item without losing other results", async () => {
    mocks.createZip.mockResolvedValue(new Blob(["zip"]));
    const readMedia = vi.fn(async (_projectId: string, reference: { assetId?: string }) => {
        if (reference.assetId === "asset-missing") throw new Error("media unavailable");
        return new Blob(["image"], { type: "image/png" });
    });
    const node = {
        id: "result", type: CanvasNodeType.Image, title: "生成方案", position: { x: 0, y: 0 }, width: 100, height: 80,
        metadata: { generationType: "image", images: [
            { id: "result-1", status: "success", content: "data:image/png;base64,eA==", assetId: "asset-missing" },
            { id: "result-2", status: "success", content: "data:image/png;base64,eA==", assetId: "asset-readable" },
            { id: "result-3", status: "error", error: "generation failed" },
        ] },
    } as CanvasNodeData;

    await expect(exportCanvasResults([node], "results", "project-a", readMedia)).resolves.toEqual({ exportedCount: 1, skippedCount: 1 });
    const files = mocks.createZip.mock.calls[0][0] as Array<{ name: string; data: BlobPart }>;
    expect(files.map((file) => file.name)).toEqual(["result-manifest.json", "生成方案-2.png"]);
    expect(JSON.parse(String(files[0].data))).toMatchObject({ skippedCount: 1, items: [{ name: "生成方案-2", assetId: "asset-readable" }] });
    expect(mocks.saveAs).toHaveBeenCalledOnce();
});

test("result export reports unreadable media when no zip can be produced", async () => {
    const readMedia = vi.fn().mockRejectedValue(new Error("media unavailable"));
    const node = {
        id: "result", type: CanvasNodeType.Image, title: "生成方案", position: { x: 0, y: 0 }, width: 100, height: 80,
        metadata: { generationType: "image", status: "success", content: "data:image/png;base64,eA==" },
    } as CanvasNodeData;

    await expect(exportCanvasResults([node], "results", "project-a", readMedia)).resolves.toEqual({ exportedCount: 0, skippedCount: 1 });
    expect(mocks.createZip).not.toHaveBeenCalled();
    expect(mocks.saveAs).not.toHaveBeenCalled();
});
