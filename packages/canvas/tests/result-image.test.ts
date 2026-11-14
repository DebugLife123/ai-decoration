import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { importCanvasResultImage } from "../src/features/canvas/result-image";
import { canvasAssetMetadata, importCanvasImage } from "../src/features/canvas/asset-import";
import { createMockCanvasAdapter } from "../src/services/api/canvas/mock-adapter";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../src/stores/use-config-store", () => ({ withLocalProxy: (url: string) => url.startsWith("https:") ? `proxy:${url}` : url }));

const png = new Blob(["result"], { type: "image/png" });
const asset = { assetId: "result", projectId: "project", name: "result.png", kind: "IMAGE" as const, mimeType: "image/png", url: "blob:result", width: 960, height: 640, bytes: png.size, createdAt: "fixture" };
const fetchImage = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchImage.mockResolvedValue(new Response(png)));
});
afterEach(() => vi.unstubAllGlobals());

test.each(["data:image/png;base64,cmVzdWx0", "blob:generated", "https://images.example/result.png"])("imports generated source %s through the host with original download settings", async (source) => {
    const importImage = vi.fn().mockResolvedValue(asset);
    const readSource = vi.fn().mockResolvedValue(png);
    const result = await importCanvasResultImage(importImage, "project", source, "result.png", undefined, readSource);
    expect(result).toBe(asset);
    expect(readSource).toHaveBeenCalledWith(source, "result.png", undefined);
    expect(importImage).toHaveBeenCalledWith("project", expect.any(File));
    const file = importImage.mock.calls[0][1] as File;
    expect(file).toMatchObject({ name: "result.png", type: "image/png", size: png.size });
    expect(await file.text()).toBe("result");
    expect(canvasAssetMetadata(result)).toMatchObject({ assetId: "result", naturalWidth: 960, naturalHeight: 640, taskId: undefined, versionId: undefined });
});

test("frame blobs skip downloading and preserve their MIME type", async () => {
    const importImage = vi.fn().mockResolvedValue(asset);
    const readSource = vi.fn();
    await importCanvasResultImage(importImage, "project", png, "first.png", undefined, readSource);
    expect(readSource).not.toHaveBeenCalled();
    expect(importImage.mock.calls[0][1]).toMatchObject({ type: "image/png", name: "first.png" });
});

test("cancellation before download or during download prevents host writes", async () => {
    const controller = new AbortController();
    controller.abort();
    const importImage = vi.fn();
    const readSource = vi.fn();
    await expect(importCanvasResultImage(importImage, "project", "blob:result", "result.png", controller.signal, readSource)).rejects.toMatchObject({ name: "AbortError" });
    expect(readSource).not.toHaveBeenCalled();
    const pending = new AbortController();
    readSource.mockImplementationOnce(async (_source, _name, signal) => { pending.abort(); signal?.throwIfAborted(); return png; });
    await expect(importCanvasResultImage(importImage, "project", "blob:result", "result.png", pending.signal, readSource)).rejects.toMatchObject({ name: "AbortError" });
    expect(importImage).not.toHaveBeenCalled();
});

test("project switch during host persistence rejects late canvas publication without deleting the saved asset", async () => {
    const controller = new AbortController();
    const importImage = vi.fn(async () => { controller.abort(); return asset; });
    await expect(importCanvasResultImage(importImage, "project", png, "result.png", controller.signal, vi.fn())).rejects.toMatchObject({ name: "AbortError" });
    expect(importImage).toHaveBeenCalledOnce();
});

test("foreign-project host results are rejected", async () => {
    await expect(importCanvasResultImage(vi.fn().mockResolvedValue({ ...asset, projectId: "other" }), "project", png, "result.png", undefined, vi.fn())).rejects.toThrow("图片结果不属于当前项目");
});

test("failed downloads and non-image responses never reach the importer", async () => {
    const importImage = vi.fn();
    await expect(importCanvasResultImage(importImage, "project", "https://images.example/failed", "result.png", undefined, vi.fn().mockRejectedValue(new Error("image read failed")))).rejects.toThrow("image read failed");
    await expect(importCanvasResultImage(importImage, "project", new Blob(["error"], { type: "text/html" }), "result.png", undefined, vi.fn())).rejects.toThrow("结果不是可导入的图片");
    expect(importImage).not.toHaveBeenCalled();
});

test("host save errors keep the error reason and allow explicit retry", async () => {
    const importImage = vi.fn().mockRejectedValueOnce(new Error("catalog write failed")).mockResolvedValue(asset);
    await expect(importCanvasResultImage(importImage, "project", png, "result.png", undefined, vi.fn())).rejects.toThrow("catalog write failed");
    expect(await importCanvasResultImage(importImage, "project", png, "result.png", undefined, vi.fn())).toBe(asset);
    expect(importImage).toHaveBeenCalledTimes(2);
});

test("string results require an injected reader", async () => {
    await expect(importCanvasResultImage(vi.fn(), "project", "blob:result", "result.png")).rejects.toThrow("结果图片读取器尚未配置");
});

test("Mock result and frame imports retain the source version and isolate project catalogs", async () => {
    vi.stubGlobal("Image", class { naturalWidth = 960; naturalHeight = 640; src = ""; decode = async () => undefined; });
    vi.stubGlobal("FileReader", class {
        result = ""; onload = () => undefined;
        async readAsDataURL(file: File) {
            this.result = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
            this.onload();
        }
    });
    const adapter = createMockCanvasAdapter({ sampleAsset: { name: "sample.png", mimeType: "image/png", url: "data:image/png;base64,cmVzdWx0", width: 960, height: 640 } });
    const { projectId } = await adapter.api.createProject("room");
    const other = await adapter.api.createProject("other");
    const importImage = (id: string, file: File) => importCanvasImage(adapter.api, id, file);
    const source = await importCanvasResultImage(importImage, projectId, png, "source.png");
    const { taskId } = await adapter.api.submitTask({ projectId, type: "EDIT", sourceAssetId: source.assetId, prompt: "room" });
    await adapter.api.getTask(taskId);
    await adapter.api.getTask(taskId);
    await adapter.api.getTask(taskId);
    const versions = structuredClone(await adapter.api.listVersions(projectId));
    expect(versions).toHaveLength(1);
    const results = await Promise.all(["generated.png", "current.png"].map((name) => importCanvasResultImage(importImage, projectId, png, name)));
    expect(new Set([source.assetId, ...results.map((item) => item.assetId)]).size).toBe(3);
    expect((await adapter.api.listAssets(projectId)).map((item) => item.assetId)).toContain(source.assetId);
    expect(await adapter.api.listAssets(other.projectId)).toEqual([]);
    expect(await adapter.api.listVersions(projectId)).toEqual(versions);
});
