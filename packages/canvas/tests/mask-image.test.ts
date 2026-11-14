import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
const { buildMaskBinary, buildMaskOverlay, createMaskImageNode } = await import("../src/features/canvas/mask-image");
const { importCanvasImage } = await import("../src/features/canvas/asset-import");
const { createMockCanvasAdapter } = await import("../src/services/api/canvas/mock-adapter");

const png = "data:image/png;base64,bWFzaw==";
const source: CanvasNodeData = {
    id: "source", type: CanvasNodeType.Image, title: "room", position: { x: 10, y: 20 }, width: 400, height: 400 * 640 / 960,
    metadata: { content: "blob:source", assetId: "original", taskId: "task", versionId: "version", storageKey: "image:old" },
};
const asset = { assetId: "mask", projectId: "project", name: "mask.png", kind: "IMAGE" as const, mimeType: "image/png", url: png, width: 960, height: 640, bytes: 4, createdAt: "fixture" };
const context = { drawImage: vi.fn(), globalAlpha: 1 };
const overlayContext = { drawImage: vi.fn(), fillRect: vi.fn(), globalCompositeOperation: "", fillStyle: "" };
const canvas = { width: 0, height: 0, getContext: vi.fn(), toDataURL: vi.fn() };
const overlay = { width: 0, height: 0, getContext: vi.fn() };
const selection = { width: 960, height: 640 } as HTMLCanvasElement;
const binaryContext = {
    getImageData: vi.fn(),
    createImageData: vi.fn(),
    putImageData: vi.fn(),
};
const binaryCanvas = { width: 0, height: 0, getContext: vi.fn(), toDataURL: vi.fn() };

beforeEach(() => {
    vi.clearAllMocks();
    context.globalAlpha = 1;
    canvas.getContext.mockReturnValue(context);
    overlay.getContext.mockReturnValue(overlayContext);
    canvas.toDataURL.mockReturnValue(png);
    binaryCanvas.getContext.mockReturnValue(context);
    binaryCanvas.toDataURL.mockReturnValue(png);
    binaryContext.getImageData.mockReturnValue({ data: new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 120]) });
    binaryContext.createImageData.mockReturnValue({ data: new Uint8ClampedArray(8) });
    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValueOnce(canvas).mockReturnValueOnce(overlay) });
    vi.stubGlobal("Image", class {
        naturalWidth = 960; naturalHeight = 640;
        src = "";
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

test("composes the existing blue annotation over the source at its original resolution", () => {
    const image = {} as HTMLImageElement;
    expect(buildMaskOverlay(image, selection)).toBe(png);
    expect(canvas).toMatchObject({ width: 960, height: 640 });
    expect(overlay).toMatchObject({ width: 960, height: 640 });
    expect(context.drawImage.mock.calls).toEqual([[image, 0, 0, 960, 640], [overlay, 0, 0]]);
    expect(overlayContext.drawImage).toHaveBeenCalledWith(selection, 0, 0);
    expect(overlayContext).toMatchObject({ globalCompositeOperation: "source-in", fillStyle: "#2563eb" });
    expect(overlayContext.fillRect).toHaveBeenCalledWith(0, 0, 960, 640);
    expect(context.globalAlpha).toBe(0.4);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png");
});

test.each(["base", "overlay"])("missing %s context rejects rather than saving an unmarked image", (target) => {
    (target === "base" ? canvas : overlay).getContext.mockReturnValue(null);
    expect(() => buildMaskOverlay({} as HTMLImageElement, selection)).toThrow(target === "base" ? "无法创建蒙版合成画布" : "无法创建蒙版标注画布");
    expect(canvas.toDataURL).not.toHaveBeenCalled();
});

test("creates an opaque black and white mask from painted alpha", () => {
    binaryCanvas.getContext.mockReturnValue(binaryContext);
    const selectionContext = { getImageData: binaryContext.getImageData };
    const selectionWithContext = { width: 2, height: 1, getContext: vi.fn().mockReturnValue(selectionContext) } as unknown as HTMLCanvasElement;
    vi.mocked(document.createElement).mockReset().mockReturnValue(binaryCanvas as unknown as HTMLCanvasElement);

    expect(buildMaskBinary(selectionWithContext)).toBe(png);
    expect(binaryContext.createImageData).toHaveBeenCalledWith(2, 1);
    expect(binaryContext.putImageData).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8ClampedArray) }), 0, 0);
    expect(Array.from(binaryContext.putImageData.mock.calls[0][0].data)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(binaryCanvas.toDataURL).toHaveBeenCalledWith("image/png");
});

test("encoding failure does not call the host importer", async () => {
    canvas.toDataURL.mockImplementationOnce(() => { throw new Error("encoding failed"); });
    const importImage = vi.fn();
    await expect((async () => createMaskImageNode(importImage, "project", source, buildMaskOverlay({} as HTMLImageElement, selection), "标注图"))()).rejects.toThrow("encoding failed");
    expect(importImage).not.toHaveBeenCalled();
});

test("saves a new PNG asset/node through the project host without inheriting source identity", async () => {
    const original = structuredClone(source);
    const importImage = vi.fn().mockResolvedValue({ ...asset, storageKey: "image:new" });
    const result = await createMaskImageNode(importImage, "project", source, png, "标注图");
    const [projectId, file] = importImage.mock.calls[0];
    expect(projectId).toBe("project");
    expect(file).toBeInstanceOf(File);
    expect(file).toMatchObject({ name: "mask.png", type: "image/png", size: 4 });
    expect(await file.text()).toBe("mask");
    expect(result.id).not.toBe(source.id);
    expect(result).toMatchObject({ type: CanvasNodeType.Image, title: "标注图", position: { x: 10, y: 20 + source.height + 96 }, width: 400,
        metadata: { content: png, assetId: "mask", storageKey: "image:new", naturalWidth: 960, naturalHeight: 640, taskId: undefined, versionId: undefined } });
    expect(result.height).toBeCloseTo(source.height);
    expect(source).toEqual(original);
});

test("forwards the active project operation signal to the host importer", async () => {
    const controller = new AbortController();
    const importImage = vi.fn().mockResolvedValue(asset);
    await createMaskImageNode(importImage, "project", source, png, "标注图", controller.signal);
    expect(importImage).toHaveBeenCalledWith("project", expect.any(File), controller.signal);
});

test("Mock saves the same mask to its isolated project catalog without creating tasks or versions", async () => {
    const { api, projects, initialProjectId: projectId } = createMockCanvasAdapter({ sampleAsset: { name: "room.png", mimeType: "image/png", url: png, width: 960, height: 640 } });
    const node = projects.getState().openProject(projectId)!.nodes[0];
    const original = await api.listAssets(projectId);
    const result = await createMaskImageNode((id, file) => importCanvasImage(api, id, file, async () => undefined), projectId, node, png, "标注图");
    const assets = await api.listAssets(projectId);
    expect(assets).toHaveLength(2);
    expect(assets[0]).toEqual(original[0]);
    expect(assets[1]).toMatchObject({ assetId: result.metadata!.assetId, name: "mask.png", width: 960, height: 640 });
    expect(result.metadata!.storageKey).toBeUndefined();
    expect(await api.listVersions(projectId)).toEqual([]);
    expect(projects.getState().openProject(projectId)!.nodes).toEqual([node]);
    const other = await api.createProject("other");
    expect(await api.listAssets(other.projectId)).toEqual([]);
});

test("missing source never calls the importer", async () => {
    const importImage = vi.fn();
    await expect(createMaskImageNode(importImage, "project", { ...source, metadata: {} }, png, "标注图")).rejects.toThrow("源图片不存在");
    expect(importImage).not.toHaveBeenCalled();
});

test("save failure leaves the source unchanged and allows a manual retry", async () => {
    const original = structuredClone(source);
    const importImage = vi.fn().mockRejectedValueOnce(new Error("save failed")).mockResolvedValue(asset);
    await expect(createMaskImageNode(importImage, "project", source, png, "标注图")).rejects.toThrow("save failed");
    expect(source).toEqual(original);
    expect((await createMaskImageNode(importImage, "project", source, png, "标注图")).metadata!.assetId).toBe("mask");
});

test("another project's asset cannot become the mask node", async () => {
    const importImage = vi.fn().mockResolvedValue({ ...asset, projectId: "other" });
    await expect(createMaskImageNode(importImage, "project", source, png, "标注图")).rejects.toThrow("蒙版结果不属于当前项目");
});
