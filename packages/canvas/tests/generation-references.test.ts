import { expect, test, vi } from "vitest";
import { readCanvasReferenceImages, type CanvasMediaAdapter } from "../src/features/canvas/media";
import { hydrateNodeGenerationContext, type NodeGenerationContext } from "../src/components/canvas/canvas-node-generation";
import { metadataReferenceImages } from "../src/lib/canvas/canvas-generation-helpers";
import { createMockCanvasAdapter } from "../src/services/api/canvas/mock-adapter";
import type { ReferenceImage } from "../src/types/image";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
// Any attempt to materialize references through old storage must fail this suite.
vi.mock("../../../web/src/services/image-storage", () => ({ imageToDataUrl: () => { throw new Error("unexpected local read"); } }));
vi.mock("../../../web/src/services/file-storage", () => ({}));
vi.mock("../src/lib/canvas/node-registry", () => ({ getNodeDefinition: vi.fn() }));

const image = (id = "one"): ReferenceImage => ({ id, name: `${id}.png`, type: "image/png", dataUrl: `blob:${id}`, storageKey: `image:${id}` });
const host = (readImage: CanvasMediaAdapter["readImage"]): CanvasMediaAdapter => ({ readImage, readMedia: vi.fn(), restore: async (_id, snapshot) => snapshot, cleanup() {} });
const signal = () => new AbortController().signal;

test("reference reads use the requested host/project and keep identity, order and source unchanged", async () => {
    const input = [image("one"), image("two")];
    const original = structuredClone(input);
    const read = vi.fn<CanvasMediaAdapter["readImage"]>(async (projectId, draft) => {
        expect(projectId).toBe("project-a");
        const url = `data:image/png;base64,${draft.id}`;
        draft.name = "mutated";
        return url;
    });
    const abortSignal = signal();
    const output = await readCanvasReferenceImages(host(read), "project-a", input, abortSignal);
    expect(output).toEqual(input.map((item) => ({ ...item, dataUrl: `data:image/png;base64,${item.id}` })));
    expect(input).toEqual(original);
    expect(read.mock.calls.map((call) => call[1])).toEqual(input.map((item) => ({ ...item, name: "mutated" })));
    expect(read).toHaveBeenCalledWith("project-a", expect.any(Object), abortSignal);
});

test("parallel reads preserve original ordering even if the second resolves first", async () => {
    let complete!: (url: string) => void;
    const pending = readCanvasReferenceImages(host(async (_id, ref) => ref.id === "one" ? new Promise((resolve) => { complete = resolve; }) : "data:two"), "a", [image("one"), image("two")], signal());
    complete("data:one");
    expect((await pending).map((ref) => ref.dataUrl)).toEqual(["data:one", "data:two"]);
});

test("empty image materialization is a missing reference error, not a silently removed input", async () => {
    await expect(readCanvasReferenceImages(host(async () => ""), "a", [image()], signal())).rejects.toThrow("canvas.projectPage.referenceMissing");
});

test("host failures are surfaced without automatic retries", async () => {
    const read = vi.fn().mockRejectedValue(new Error("unavailable"));
    await expect(readCanvasReferenceImages(host(read), "a", [image()], signal())).rejects.toThrow("unavailable");
    expect(read).toHaveBeenCalledOnce();
});

test("already cancelled requests never enter a host, including empty reference lists", async () => {
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn();
    await expect(readCanvasReferenceImages(host(read), "a", [image()], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(readCanvasReferenceImages(host(read), "a", [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
});

test("late reads after cancellation cannot be passed to a generation request", async () => {
    const controller = new AbortController();
    let complete!: (url: string) => void;
    const request = vi.fn();
    const pending = readCanvasReferenceImages(host(() => new Promise((resolve) => { complete = resolve; })), "a", [image()], controller.signal).then(request);
    controller.abort();
    complete("data:image/png;base64,late");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
});

test("generation context changes only image bytes, not prompts, counts or audio/video inputs", async () => {
    const context: NodeGenerationContext = { prompt: "room", referenceImages: [image()], referenceVideos: [{ id: "video", name: "room.mp4", type: "video/mp4", url: "blob:video" }], referenceAudios: [{ id: "audio", name: "room.mp3", type: "audio/mpeg", url: "blob:audio" }], textCount: 1, imageCount: 1, videoCount: 1, audioCount: 1 };
    const original = structuredClone(context);
    const output = await hydrateNodeGenerationContext(context, host(async () => "data:image/png;base64,room"), "a", signal());
    expect(output).toEqual({ ...context, referenceImages: [{ ...image(), dataUrl: "data:image/png;base64,room" }] });
    expect(context).toEqual(original);
});

test("metadata references are opaque to the editor and resolved only by its host", async () => {
    const references = ["image:stored", "data:image/png;base64,room", "https://test.invalid/room.png"];
    const metadata = { generationType: "edit" as const, references };
    const original = structuredClone(metadata);
    const input = metadataReferenceImages(metadata)!;
    expect(input.map((ref) => ref.dataUrl)).toEqual(references);
    const read = vi.fn<CanvasMediaAdapter["readImage"]>(async (_projectId, ref) => `data:image/png;base64,${ref.id}`);
    expect((await readCanvasReferenceImages(host(read), "a", input, signal())).map((ref) => ref.id)).toEqual(["0", "1", "2"]);
    expect(metadata).toEqual(original);
});

test("generation retries have no references and edit retries require a saved list", () => {
    expect(metadataReferenceImages({ generationType: "generation", references: ["ignored"] })).toEqual([]);
    expect(metadataReferenceImages({ generationType: "edit" })).toBeNull();
    expect(metadataReferenceImages({ generationType: "edit", references: [] })).toBeNull();
});

const createMock = () => createMockCanvasAdapter({ sampleAsset: { name: "sample.png", url: "data:image/png;base64,room", mimeType: "image/png", width: 80, height: 40 } });

test("Mock uses in-memory image references without old media storage or network access", async () => {
    const adapter = createMock();
    const asset = (await adapter.api.listAssets(adapter.initialProjectId))[0];
    const input = { id: asset.assetId, name: asset.name, type: asset.mimeType, dataUrl: asset.url };
    expect(await readCanvasReferenceImages(adapter.media, adapter.initialProjectId, [input], signal())).toEqual([input]);
});

test("Mock refuses local keys and external URLs rather than falling back to old media storage", async () => {
    const adapter = createMock();
    for (const ref of [image(), { ...image(), storageKey: undefined, dataUrl: "https://test.invalid/image.png" }, { ...image(), storageKey: undefined, dataUrl: "image:stored" }]) {
        await expect(readCanvasReferenceImages(adapter.media, adapter.initialProjectId, [ref], signal())).rejects.toThrow("Mock 仅支持内存图片引用");
    }
});

test("Mock reference reads reject deleted projects and cancellation", async () => {
    const adapter = createMock();
    const ref = { ...image(), storageKey: undefined, dataUrl: "data:image/png;base64,room" };
    await expect(readCanvasReferenceImages(adapter.media, "missing", [ref], signal())).rejects.toThrow("项目不存在");
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.media.readImage(adapter.initialProjectId, ref, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    adapter.projects.getState().deleteProjects([adapter.initialProjectId]);
    await expect(readCanvasReferenceImages(adapter.media, adapter.initialProjectId, [ref], signal())).rejects.toThrow("项目不存在");
});
