import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
const { createUpscaledImageNode } = await import("../src/features/canvas/upscale-image");
const { prepareImageSplit, saveImageSplit } = await import("../src/features/canvas/split-image");
const { importCanvasImage } = await import("../src/features/canvas/asset-import");
const { createMockCanvasAdapter } = await import("../src/services/api/canvas/mock-adapter");

const png = "data:image/png;base64,dG9vbA==";
const source: CanvasNodeData = {
    id: "source", type: CanvasNodeType.Image, title: "room", position: { x: 10, y: 20 }, width: 480, height: 320,
    metadata: { content: "blob:source", prompt: "room prompt", assetId: "original", storageKey: "image:old", taskId: "task", versionId: "version" },
};
const asset = { assetId: "new", projectId: "project", name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", url: png, width: 960, height: 640, bytes: 4, createdAt: "fixture" };
const upscale = { targetLongEdge: 2048, algorithm: "high" as const };
const split = { rows: 2, columns: 2, horizontalLines: [0.25], verticalLines: [0.25] };
const drawImage = vi.fn();
const context = { drawImage, imageSmoothingEnabled: true, imageSmoothingQuality: "high" };
const getContext = vi.fn();
const toDataURL = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    getContext.mockReturnValue(context);
    toDataURL.mockReturnValue(png);
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext, toDataURL }) });
    vi.stubGlobal("Image", class {
        width = 960; height = 640; naturalWidth = 960; naturalHeight = 640;
        onload: (() => void) | null = null;
        set src(_value: string) { queueMicrotask(() => this.onload?.()); }
        decode = async () => undefined;
    });
    vi.stubGlobal("FileReader", class {
        result = "";
        onload = () => undefined;
        async readAsDataURL(file: File) {
            this.result = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
            this.onload();
        }
    });
});
afterEach(() => vi.unstubAllGlobals());

test.each(["high", "bilinear", "nearest"] as const)("upscale %s imports a PNG without source task/version identity", async (algorithm) => {
    const original = structuredClone(source);
    const importImage = vi.fn().mockResolvedValue({ ...asset, width: 2048, height: 1365 });
    const result = await createUpscaledImageNode(importImage, "project", source, { ...upscale, algorithm });
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, algorithm === "high" ? 1920 : 960, algorithm === "high" ? 1280 : 640, 0, 0, 2048, 1365);
    expect(importImage).toHaveBeenCalledWith("project", expect.any(File));
    expect(importImage.mock.calls[0][1]).toMatchObject({ name: "room-upscale.png", type: "image/png", size: 4 });
    expect(result).toMatchObject({ position: { x: 586, y: 20 }, metadata: { assetId: "new", content: png, prompt: "room prompt", taskId: undefined, versionId: undefined, storageKey: undefined } });
    expect(result.id).not.toBe(source.id);
    expect(result.width / result.height).toBeCloseTo(2048 / 1365);
    expect(source).toEqual(original);
});

test("upscale retains the existing 4096 long-edge ceiling", async () => {
    await createUpscaledImageNode(vi.fn().mockResolvedValue(asset), "project", source, { targetLongEdge: 8192, algorithm: "nearest" });
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 960, 640, 0, 0, 4096, 2731);
});

test("upscale failures leave the source intact and allow manual retry", async () => {
    const original = structuredClone(source);
    const importImage = vi.fn().mockRejectedValueOnce(new Error("save failed")).mockResolvedValue(asset);
    await expect(createUpscaledImageNode(importImage, "project", source, upscale)).rejects.toThrow("save failed");
    expect((await createUpscaledImageNode(importImage, "project", source, upscale)).metadata!.assetId).toBe("new");
    expect(source).toEqual(original);
});

test("upscale rejects a foreign project result", async () => {
    await expect(createUpscaledImageNode(vi.fn().mockResolvedValue({ ...asset, projectId: "other" }), "project", source, upscale)).rejects.toThrow("放大结果不属于当前项目");
});

test("split preserves pixel bounds and unequal piece proportions", async () => {
    const original = structuredClone(source);
    const batch = await prepareImageSplit("project", source, split);
    expect(batch.items.map(({ piece }) => [piece.x, piece.y, piece.width, piece.height])).toEqual([[0, 0, 240, 160], [240, 0, 720, 160], [0, 160, 240, 480], [240, 160, 720, 480]]);
    const importImage = vi.fn(async (_id: string, file: File) => {
        const piece = batch.items.find(({ piece }) => file.name === `room ${piece.row + 1}-${piece.column + 1}.png`)!.piece;
        return { ...asset, assetId: file.name, width: piece.width, height: piece.height };
    });
    const saved = await saveImageSplit(importImage, batch);
    expect(importImage).toHaveBeenCalledTimes(4);
    expect(saved.items.map(({ node }) => [node!.position.x, node!.position.y, node!.width, node!.height])).toEqual([[586, 20, 120, 80], [722, 20, 360, 80], [586, 116, 120, 240], [722, 116, 360, 240]]);
    expect(saved.items.every(({ node }) => node!.metadata!.taskId === undefined && node!.metadata!.versionId === undefined)).toBe(true);
    expect(new Set(saved.items.map(({ node }) => node!.id)).size).toBe(4);
    expect(batch.items.every((item) => !item.node)).toBe(true);
    expect(source).toEqual(original);
});

test("split retries only failed pieces and retains successful asset/node identities", async () => {
    const batch = await prepareImageSplit("project", source, split);
    const importImage = vi.fn().mockResolvedValue(asset).mockRejectedValueOnce(new Error("quota failed"));
    const partial = await saveImageSplit(importImage, batch);
    expect(partial.items.filter((item) => item.node)).toHaveLength(3);
    expect(partial.items[0]).toMatchObject({ error: "quota failed" });
    const retry = await saveImageSplit(importImage, partial);
    expect(importImage).toHaveBeenCalledTimes(5);
    expect(retry.items.every((item) => item.node && !item.error)).toBe(true);
    for (let index = 1; index < 4; index++) expect(retry.items[index]).toBe(partial.items[index]);
    await saveImageSplit(importImage, retry);
    expect(importImage).toHaveBeenCalledTimes(5);
});

test("split captures project/source at preparation, even if the caller switches or edits later", async () => {
    const editable = structuredClone(source);
    const pending = prepareImageSplit("project", editable, split);
    editable.position.x = 9000;
    editable.metadata!.prompt = "changed";
    const batch = await pending;
    const importImage = vi.fn().mockResolvedValue(asset);
    const result = await saveImageSplit(importImage, batch);
    expect(importImage.mock.calls.every(([id]) => id === "project")).toBe(true);
    expect(result.items[0].node).toMatchObject({ position: { x: 586, y: 20 }, metadata: { prompt: "room prompt" } });
});

test("all failed and foreign-project split pieces stay retryable without returned nodes", async () => {
    const batch = await prepareImageSplit("project", source, split);
    const failed = await saveImageSplit(vi.fn().mockResolvedValue({ ...asset, projectId: "other" }), batch);
    expect(failed.items.every((item) => !item.node && item.error === "切图结果不属于当前项目")).toBe(true);
    expect((await saveImageSplit(vi.fn().mockResolvedValue(asset), failed)).items.every((item) => item.node)).toBe(true);
});

test.each(["missing", "load", "context", "encoding"])("%s failure does not import upscale or split results", async (failure) => {
    const input = failure === "missing" ? { ...source, metadata: {} } : source;
    if (failure === "load") vi.stubGlobal("Image", class {
        onerror: (() => void) | null = null;
        set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    });
    if (failure === "context") getContext.mockReturnValue(null);
    if (failure === "encoding") toDataURL.mockImplementation(() => { throw new Error("encoding failed"); });
    const importImage = vi.fn();
    await expect(createUpscaledImageNode(importImage, "project", input, upscale)).rejects.toThrow();
    await expect(prepareImageSplit("project", input, split)).rejects.toThrow();
    expect(importImage).not.toHaveBeenCalled();
});

test("Mock upscale and split share the importer without writing versions or another project", async () => {
    const { api, projects, initialProjectId: projectId } = createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: png, width: 960, height: 640 } });
    const node = projects.getState().openProject(projectId)!.nodes[0];
    const original = await api.listAssets(projectId);
    const importImage = (id: string, file: File) => importCanvasImage(api, id, file, async () => undefined);
    const enlarged = await createUpscaledImageNode(importImage, projectId, node, upscale);
    const batch = await saveImageSplit(importImage, await prepareImageSplit(projectId, node, split));
    expect(batch.items.every((item) => item.node)).toBe(true);
    const assets = await api.listAssets(projectId);
    expect(assets).toHaveLength(6);
    expect(assets[0]).toEqual(original[0]);
    expect(assets.some((asset) => asset.assetId === enlarged.metadata!.assetId)).toBe(true);
    expect(await api.listVersions(projectId)).toEqual([]);
    expect(projects.getState().openProject(projectId)!.nodes).toEqual([node]);
    const other = await api.createProject("other");
    expect(await api.listAssets(other.projectId)).toEqual([]);
});
