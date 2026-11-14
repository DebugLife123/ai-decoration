import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requestCanvasImageEdit } from "../src/services/api/canvas/edit-image";
import { requestEdit } from "../src/services/api/image";
import { buildImageGenerationMetadata } from "../src/lib/canvas/canvas-node-factory";
import { createMockCanvasAdapter } from "../src/services/api/canvas/mock-adapter";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";
import type { AiConfig } from "../src/stores/use-config-store";
import type { ReferenceImage } from "../src/types/image";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../src/services/api/image", () => ({ requestEdit: vi.fn() }));
vi.mock("../../../web/src/services/image-storage", () => ({ imageToDataUrl: () => { throw new Error("unexpected local read"); } }));
vi.mock("../../../web/src/services/file-storage", () => ({}));

const config = { model: "fixture", count: "1", size: "auto", quality: "auto" } as AiConfig;
const source: ReferenceImage = { id: "source", name: "room.png", type: "image/jpeg", dataUrl: "blob:source", storageKey: "image:source" };
const mask: ReferenceImage = { id: "mask", name: "mask.png", type: "image/png", dataUrl: "blob:mask", storageKey: "image:mask" };
const result = [{ id: "new-image", dataUrl: "data:image/png;base64,result" }];
const provider = vi.mocked(requestEdit);
const readImage = vi.fn<CanvasMediaAdapter["readImage"]>();
const media: CanvasMediaAdapter = { readImage, readMedia: vi.fn(), restore: async (_id, snapshot) => snapshot, cleanup() {} };
const run = (references = [source, mask], signal = new AbortController().signal) => requestCanvasImageEdit(media, "project", config, "edit room", references, signal);

beforeEach(() => {
    provider.mockReset().mockResolvedValue(result);
    readImage.mockReset().mockImplementation(async (_projectId, image) => `data:${image.type};base64,${image.id}`);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("unexpected network request"); }));
});
afterEach(() => vi.unstubAllGlobals());

test.each(["mask", "angle"])("%s editing reads the original inputs through the host before the existing provider", async (kind) => {
    const references = kind === "mask" ? [source, mask] : [source];
    const original = structuredClone(references);
    const signal = new AbortController().signal;
    expect(await run(references, signal)).toBe(result);
    expect(readImage.mock.calls).toEqual(references.map((image) => ["project", image, signal]));
    expect(provider).toHaveBeenCalledExactlyOnceWith(config, "edit room", references.map((image) => ({ ...image, dataUrl: `data:${image.type};base64,${image.id}` })), { signal, readImage: expect.any(Function) });
    expect(await provider.mock.calls[0][3]?.readImage?.(provider.mock.calls[0][2][0])).toBe(`data:${source.type};base64,${source.id}`);
    expect(references).toEqual(original);
    expect(fetch).not.toHaveBeenCalled();
});

test("both original and saved annotation must finish reading before any provider call", async () => {
    let complete!: (url: string) => void;
    readImage.mockImplementation(async (_id, image) => image.id === "source" ? "data:image/jpeg;base64,source" : new Promise((resolve) => { complete = resolve; }));
    const pending = run();
    await Promise.resolve();
    expect(provider).not.toHaveBeenCalled();
    complete("data:image/png;base64,annotation");
    await pending;
    expect(provider.mock.calls[0][2].map((image) => image.dataUrl)).toEqual(["data:image/jpeg;base64,source", "data:image/png;base64,annotation"]);
});

test.each(["source", "mask"])("unreadable %s rejects without submitting, saving or automatically retrying", async (id) => {
    readImage.mockImplementation(async (_projectId, image) => {
        if (image.id === id) throw new Error("read failed");
        return "data:image/png;base64,ready";
    });
    const save = vi.fn();
    await expect(run().then(save)).rejects.toThrow("read failed");
    expect(provider).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(readImage).toHaveBeenCalledTimes(2);
});

test.each(["source", "mask"])("empty %s does not silently remove an edit input", async (id) => {
    readImage.mockImplementation(async (_projectId, image) => image.id === id ? "" : "data:image/png;base64,ready");
    await expect(run()).rejects.toThrow("canvas.projectPage.referenceMissing");
    expect(provider).not.toHaveBeenCalled();
});

test("already cancelled editing never reads or submits", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run([source], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(readImage).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
});

test("late host reads after cancellation cannot submit to the provider", async () => {
    const controller = new AbortController();
    let complete!: (url: string) => void;
    readImage.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const pending = run([source], controller.signal);
    controller.abort();
    complete("data:image/png;base64,late");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(provider).not.toHaveBeenCalled();
});

test("provider success after cancellation cannot reach result saving", async () => {
    const controller = new AbortController();
    provider.mockImplementation(async () => { controller.abort(); return result; });
    const save = vi.fn();
    await expect(run([source], controller.signal).then(save)).rejects.toMatchObject({ name: "AbortError" });
    expect(provider).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
});

test("provider cancellation propagates without saving or resubmitting", async () => {
    provider.mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const save = vi.fn();
    await expect(run().then(save)).rejects.toMatchObject({ name: "AbortError" });
    expect(save).not.toHaveBeenCalled();
    expect(provider).toHaveBeenCalledOnce();
});

test("provider errors retain the existing failure without automatic retry", async () => {
    provider.mockRejectedValue(new Error("provider failed"));
    await expect(run()).rejects.toThrow("provider failed");
    expect(provider).toHaveBeenCalledOnce();
});

test("an explicit retry re-reads through the host and only then submits", async () => {
    readImage.mockRejectedValueOnce(new Error("read failed"));
    await expect(run([source])).rejects.toThrow("read failed");
    expect(provider).not.toHaveBeenCalled();
    expect(await run([source])).toBe(result);
    expect(readImage).toHaveBeenCalledTimes(2);
    expect(provider).toHaveBeenCalledOnce();
});

test("successful edits do not replace saved source and annotation references with transient materialized bytes", async () => {
    const references = structuredClone([source, mask]);
    const metadata = buildImageGenerationMetadata("edit", config, 1, references);
    await run(references);
    expect(buildImageGenerationMetadata("edit", config, 1, references)).toEqual(metadata);
    expect(metadata.references).toEqual(["image:source", "image:mask"]);
    expect(metadata).not.toHaveProperty("versionId");
});

test("Mock media refuses local references before any provider and does not change its assets or versions", async () => {
    const adapter = createMockCanvasAdapter({ sampleAsset: { name: "sample.png", url: "data:image/png;base64,room", mimeType: "image/png", width: 80, height: 40 } });
    const projectId = adapter.initialProjectId;
    const assets = await adapter.api.listAssets(projectId);
    const versions = await adapter.api.listVersions(projectId);
    await expect(requestCanvasImageEdit(adapter.media, projectId, config, "edit", [source, mask], new AbortController().signal)).rejects.toThrow("Mock 仅支持内存图片引用");
    expect(provider).not.toHaveBeenCalled();
    expect(await adapter.api.listAssets(projectId)).toEqual(assets);
    expect(await adapter.api.listVersions(projectId)).toEqual(versions);
});
