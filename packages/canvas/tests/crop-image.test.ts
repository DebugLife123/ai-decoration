import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
const { createCroppedImageNode } = await import("../src/features/canvas/crop-image");
const { importCanvasImage } = await import("../src/features/canvas/asset-import");
const { createMockCanvasAdapter } = await import("../src/services/api/canvas/mock-adapter");

const png = "data:image/png;base64,Y3JvcA==";
const crop = { x: 0.25, y: 0.125, width: 0.5, height: 0.5 };
const source: CanvasNodeData = {
    id: "source", type: CanvasNodeType.Image, title: "room", position: { x: 10, y: 20 }, width: 400, height: 400 * 640 / 960,
    metadata: { content: "blob:source", prompt: "room prompt", assetId: "original", taskId: "task", versionId: "version", storageKey: "image:old" },
};
const asset = { assetId: "cropped", projectId: "project", name: "room-crop.png", kind: "IMAGE" as const, mimeType: "image/png", url: png, width: 480, height: 320, bytes: 4, createdAt: "fixture" };
const drawImage = vi.fn();
const canvas = { width: 0, height: 0, getContext: vi.fn(), toDataURL: vi.fn() };

beforeEach(() => {
    vi.clearAllMocks();
    canvas.getContext.mockReturnValue({ drawImage });
    canvas.toDataURL.mockReturnValue(png);
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    vi.stubGlobal("Image", class {
        width = 960; height = 640; naturalWidth = 480; naturalHeight = 320;
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

test("crops pixels then imports a PNG through the current project host without changing the source", async () => {
    const original = structuredClone(source);
    const importImage = vi.fn().mockResolvedValue({ ...asset, storageKey: "image:new" });
    const result = await createCroppedImageNode(importImage, "project", source, crop);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 240, 80, 480, 320, 0, 0, 480, 320);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png");
    const [projectId, file] = importImage.mock.calls[0];
    expect(projectId).toBe("project");
    expect(file).toBeInstanceOf(File);
    expect(file).toMatchObject({ name: "room-crop.png", type: "image/png", size: 4 });
    expect(await file.text()).toBe("crop");
    expect(result.id).not.toBe(source.id);
    expect(result.height).toBeCloseTo(400 * 320 / 480);
    expect(result).toMatchObject({ type: CanvasNodeType.Image, position: { x: 506, y: 20 }, width: 400,
        metadata: { content: png, prompt: "room prompt", assetId: "cropped", storageKey: "image:new", naturalWidth: 480, naturalHeight: 320, taskId: undefined, versionId: undefined } });
    expect(source).toEqual(original);
});

test("Mock uses the same crop helper and image importer, preserving source assets and versions", async () => {
    const { api, projects, initialProjectId: projectId } = createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: png, width: 960, height: 640 } });
    const node = projects.getState().openProject(projectId)!.nodes[0];
    const original = await api.listAssets(projectId);
    const result = await createCroppedImageNode((id, file) => importCanvasImage(api, id, file, async () => undefined), projectId, node, crop);
    const assets = await api.listAssets(projectId);
    expect(assets).toHaveLength(2);
    expect(assets[0]).toEqual(original[0]);
    expect(assets[1]).toMatchObject({ assetId: result.metadata!.assetId, width: 480, height: 320 });
    expect(result.metadata!.storageKey).toBeUndefined();
    expect(await api.listVersions(projectId)).toEqual([]);
    expect(projects.getState().openProject(projectId)!.nodes).toEqual([node]);
    const other = await api.createProject("other");
    expect(await api.listAssets(other.projectId)).toEqual([]);
});

test("missing content never calls the importer", async () => {
    const importImage = vi.fn();
    await expect(createCroppedImageNode(importImage, "project", { ...source, metadata: {} }, crop)).rejects.toThrow("源图片不存在");
    expect(importImage).not.toHaveBeenCalled();
});

test("image load failure rejects instead of leaving the crop pending", async () => {
    vi.stubGlobal("Image", class {
        onerror: (() => void) | null = null;
        set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    });
    const importImage = vi.fn();
    await expect(createCroppedImageNode(importImage, "project", source, crop)).rejects.toThrow("无法读取源图片");
    expect(importImage).not.toHaveBeenCalled();
});

test("missing canvas context does not save the uncropped original as a result", async () => {
    canvas.getContext.mockReturnValue(null);
    const importImage = vi.fn();
    await expect(createCroppedImageNode(importImage, "project", source, crop)).rejects.toThrow("无法创建图片裁剪画布");
    expect(importImage).not.toHaveBeenCalled();
});

test("PNG encoding failure does not create an asset", async () => {
    canvas.toDataURL.mockImplementationOnce(() => { throw new Error("encoding failed"); });
    const importImage = vi.fn();
    await expect(createCroppedImageNode(importImage, "project", source, crop)).rejects.toThrow("encoding failed");
    expect(importImage).not.toHaveBeenCalled();
});

test("adapter failure leaves the original unchanged and permits a fresh retry", async () => {
    const original = structuredClone(source);
    const importImage = vi.fn().mockRejectedValueOnce(new Error("save failed")).mockResolvedValue(asset);
    await expect(createCroppedImageNode(importImage, "project", source, crop)).rejects.toThrow("save failed");
    expect(source).toEqual(original);
    expect((await createCroppedImageNode(importImage, "project", source, crop)).metadata!.assetId).toBe("cropped");
});

test("an adapter result from another project is not returned as a canvas node", async () => {
    const importImage = vi.fn().mockResolvedValue({ ...asset, projectId: "other" });
    await expect(createCroppedImageNode(importImage, "project", source, crop)).rejects.toThrow("裁剪结果不属于当前项目");
});
