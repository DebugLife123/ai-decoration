import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

const mocks = vi.hoisted(() => ({
    exists: true, importImage: vi.fn(), importVideo: vi.fn(), importAudio: vi.fn(), list: vi.fn(), projectSubscribe: vi.fn(), globalSubscribe: vi.fn(),
    hydrateNodes: vi.fn(), hydrateSessions: vi.fn(), resetNodes: vi.fn(), cleanup: vi.fn(), readImage: vi.fn(), resolveImage: vi.fn(), resolveMedia: vi.fn(), uploadImage: vi.fn(),
    readMedia: vi.fn(),
}));
vi.mock("@/stores/canvas/use-canvas-store", () => ({ useCanvasStore: { getState: () => ({ openProject: () => mocks.exists ? { id: "a" } : null }) } }));
vi.mock("@infinite-canvas/core/project-assets", () => ({ importProjectImage: mocks.importImage, importProjectVideo: mocks.importVideo, importProjectAudio: mocks.importAudio, listProjectAssets: mocks.list, subscribeProjectAssets: mocks.projectSubscribe }));
vi.mock("../../../web/src/services/api/canvas/asset-library", () => ({ localCanvasAssetLibrary: { list: async () => [{ id: "my-assets", label: "我的资产", items: [] }], subscribe: mocks.globalSubscribe } }));
vi.mock("../../../web/src/services/api/canvas/local-cleanup", () => ({ cleanupLocalCanvasMedia: mocks.cleanup }));
vi.mock("../../../web/src/services/api/canvas/local-catalog", () => ({ localCanvasProjectAssetCatalog: { id: "local-catalog" } }));
vi.mock("@infinite-canvas/core/generation-media", () => ({ hydrateCanvasImages: mocks.hydrateNodes, hydrateAssistantImages: mocks.hydrateSessions, resetInterruptedGeneration: mocks.resetNodes }));
vi.mock("../../../web/src/services/image-storage", () => ({ resolveImageUrl: mocks.resolveImage, uploadImage: mocks.uploadImage }));
vi.mock("../../../web/src/services/file-storage", () => ({ resolveMediaUrl: mocks.resolveMedia }));
vi.mock("../../../web/src/services/api/canvas/local-project-asset-storage", () => ({ localCanvasProjectAssetStorage: { readImage: mocks.readImage, readMedia: mocks.readMedia, readStoredBlob: vi.fn() } }));

import { createLocalCanvasAssetLibrary, importLocalCanvasAudio, importLocalCanvasImage, importLocalCanvasVideo, localCanvasMedia } from "../../../web/src/services/api/canvas/local-adapter";
import { restoreCanvasMedia, type CanvasMediaSnapshot } from "../src/features/canvas/media";
import { CanvasNodeType } from "../src/types/canvas";

beforeEach(() => { vi.resetAllMocks(); mocks.exists = true; mocks.list.mockResolvedValue([]); });
afterEach(() => vi.unstubAllGlobals());

test("web library includes only its project plus unchanged global sources and cleans subscriptions", async () => {
    const library = createLocalCanvasAssetLibrary("a");
    expect((await library.list()).map((source) => source.id)).toEqual(["project", "my-assets"]);
    expect(mocks.list).toHaveBeenCalledWith("a", { id: "local-catalog" });
    const stopProject = vi.fn(), stopGlobal = vi.fn();
    mocks.projectSubscribe.mockReturnValue(stopProject);
    mocks.globalSubscribe.mockReturnValue(stopGlobal);
    const listener = vi.fn();
    library.subscribe!(listener)();
    expect(mocks.projectSubscribe).toHaveBeenCalledWith(listener);
    expect(mocks.globalSubscribe).toHaveBeenCalledWith(listener);
    expect(stopProject).toHaveBeenCalledOnce();
    expect(stopGlobal).toHaveBeenCalledOnce();
    mocks.exists = false;
    await expect(library.list()).rejects.toThrow("项目不存在");
});

test("web import checks live project existence throughout the storage operation", async () => {
    mocks.importImage.mockImplementation(async (_id, _file, exists: () => boolean) => {
        expect(exists()).toBe(true);
        mocks.exists = false;
        expect(exists()).toBe(false);
    });
    const file = new File([], "room.png", { type: "image/png" });
    await importLocalCanvasImage("a", file);
    expect(mocks.importImage).toHaveBeenCalledWith("a", file, expect.any(Function), { id: "local-catalog" }, undefined);
});

test("web video import uses the same live project guard without entering the image importer", async () => {
    mocks.importVideo.mockImplementation(async (_id, _file, exists: () => boolean) => {
        expect(exists()).toBe(true);
        mocks.exists = false;
        expect(exists()).toBe(false);
    });
    const file = new File([], "room.mp4", { type: "video/mp4" });
    const signal = new AbortController().signal;
    await importLocalCanvasVideo("a", file, signal);
    expect(mocks.importVideo).toHaveBeenCalledWith("a", file, expect.any(Function), { id: "local-catalog" }, signal);
    expect(mocks.importImage).not.toHaveBeenCalled();
});

test("web audio import uses a live project guard without entering image or video importers", async () => {
    mocks.importAudio.mockImplementation(async (_id, _file, exists: () => boolean) => {
        expect(exists()).toBe(true);
        mocks.exists = false;
        expect(exists()).toBe(false);
    });
    const file = new File([], "narration.mp3", { type: "audio/mpeg" });
    const signal = new AbortController().signal;
    await importLocalCanvasAudio("a", file, signal);
    expect(mocks.importAudio).toHaveBeenCalledWith("a", file, expect.any(Function), { id: "local-catalog" }, signal);
    expect(mocks.importImage).not.toHaveBeenCalled();
    expect(mocks.importVideo).not.toHaveBeenCalled();
});

const snapshot = (): CanvasMediaSnapshot => ({ nodes: [{ id: "image", title: "image", type: CanvasNodeType.Image, position: { x: 0, y: 0 }, width: 80, height: 40, metadata: { content: "blob:old", storageKey: "image:key" } }], chatSessions: [] });
const restore = (input = snapshot(), signal = new AbortController().signal) => restoreCanvasMedia(localCanvasMedia, "a", input, signal);

test("web media adapter injects local media storage for node and assistant hydration without mutating the source", async () => {
    const input = snapshot();
    mocks.resetNodes.mockImplementation((nodes) => {
        expect(nodes).toEqual(input.nodes);
        expect(nodes).not.toBe(input.nodes);
        return nodes;
    });
    mocks.hydrateNodes.mockImplementation(async (nodes) => {
        nodes[0].metadata.content = "blob:restored";
        return nodes;
    });
    mocks.hydrateSessions.mockImplementation(async (sessions) => sessions);
    mocks.resolveImage.mockResolvedValue("blob:restored");
    mocks.resolveMedia.mockResolvedValue("blob:restored-media");
    const result = await restore(input);
    expect(mocks.resetNodes).toHaveBeenCalledOnce();
    expect(mocks.hydrateNodes).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ resolveImage: expect.any(Function), resolveMedia: expect.any(Function), uploadImage: expect.any(Function) }), expect.any(AbortSignal));
    expect(mocks.hydrateSessions).toHaveBeenCalledWith(input.chatSessions, expect.any(Object), expect.any(AbortSignal));
    expect(result.nodes[0].metadata?.content).toBe("blob:restored");
    expect(input.nodes[0].metadata?.content).toBe("blob:old");
});

test("web restoration delegates legacy URL fallback and data URL upload through the injected local storage", async () => {
    const signal = new AbortController().signal;
    mocks.resolveImage.mockResolvedValueOnce("");
    mocks.resolveMedia.mockResolvedValueOnce("");
    mocks.uploadImage.mockResolvedValue({ url: "blob:saved", storageKey: "image:saved", width: 2, height: 1, bytes: 4, mimeType: "image/png" });
    mocks.hydrateNodes.mockImplementation(async (_nodes, storage, passedSignal) => {
        expect(passedSignal).toBe(signal);
        await expect(storage.resolveImage("image:key", "blob:legacy-image")).resolves.toBe("blob:legacy-image");
        await expect(storage.resolveMedia("video:key", "blob:legacy-video")).resolves.toBe("blob:legacy-video");
        await storage.uploadImage("data:image/png;base64,fixture", passedSignal);
        return [];
    });
    mocks.hydrateSessions.mockResolvedValue([]);

    await restore(snapshot(), signal);

    expect(mocks.resolveImage).toHaveBeenCalledWith("image:key", "blob:legacy-image");
    expect(mocks.resolveMedia).toHaveBeenCalledWith("video:key", "blob:legacy-video");
    expect(mocks.uploadImage).toHaveBeenCalledWith("data:image/png;base64,fixture", { signal });
});

test("missing project never enters local media storage", async () => {
    mocks.exists = false;
    await expect(restore()).rejects.toThrow("项目不存在");
    expect(mocks.hydrateNodes).not.toHaveBeenCalled();
});

test("project removal during node restore prevents assistant restore and publication", async () => {
    mocks.hydrateNodes.mockImplementation(async () => { mocks.exists = false; return []; });
    await expect(restore()).rejects.toThrow("项目不存在");
    expect(mocks.hydrateSessions).not.toHaveBeenCalled();
});

test("storage failure is surfaced and an explicit subsequent restore can succeed", async () => {
    mocks.hydrateNodes.mockRejectedValueOnce(new Error("storage unavailable")).mockResolvedValue([]);
    mocks.hydrateSessions.mockResolvedValue([]);
    await expect(restore()).rejects.toThrow("storage unavailable");
    expect(mocks.hydrateNodes).toHaveBeenCalledOnce();
    await expect(restore()).resolves.toEqual({ nodes: [], chatSessions: [] });
    expect(mocks.hydrateNodes).toHaveBeenCalledTimes(2);
});

test("cancellation between node and assistant restore stops subsequent reads", async () => {
    const controller = new AbortController();
    mocks.hydrateNodes.mockImplementation(async () => { controller.abort(); return []; });
    await expect(restore(snapshot(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.hydrateSessions).not.toHaveBeenCalled();
});

test("project removal during assistant restore rejects the whole snapshot", async () => {
    mocks.hydrateNodes.mockResolvedValue([]);
    mocks.hydrateSessions.mockImplementation(async () => { mocks.exists = false; return []; });
    await expect(restore()).rejects.toThrow("项目不存在");
});

test("cleanup delegates all history references to existing reference-aware cleanup", () => {
    const context = { projectId: "a", reason: "node-removed" as const, history: { past: [snapshot()], future: [] }, lastHistory: snapshot(), extra: { nodeId: "removed" } };
    localCanvasMedia.cleanup(context);
    expect(mocks.cleanup).toHaveBeenCalledWith(context);
    localCanvasMedia.cleanup({ projectId: "a", reason: "project-deleted" });
    expect(mocks.cleanup).toHaveBeenLastCalledWith({ projectId: "a", reason: "project-deleted" });
});

const reference = { id: "ref", name: "room.png", type: "image/png", dataUrl: "blob:room", storageKey: "image:key" };

test("web reference reads delegate to host storage with cancellation and preserve normal sources", async () => {
    const signal = new AbortController().signal;
    mocks.readImage.mockResolvedValue("data:image/png;base64,room");
    await expect(localCanvasMedia.readImage("a", reference, signal)).resolves.toBe("data:image/png;base64,room");
    expect(mocks.readImage).toHaveBeenCalledWith(reference, signal);
});

test("saved local image keys are resolved by web rather than fetched as URLs", async () => {
    const signal = new AbortController().signal;
    mocks.readImage.mockResolvedValue("data:image/png;base64,room");
    await localCanvasMedia.readImage("a", { ...reference, dataUrl: "image:saved", storageKey: undefined }, signal);
    expect(mocks.readImage).toHaveBeenCalledWith({ storageKey: "image:saved" }, signal);
});

test("cancelled or missing project reference reads never touch storage", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(localCanvasMedia.readImage("a", reference, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    mocks.exists = false;
    await expect(localCanvasMedia.readImage("a", reference, new AbortController().signal)).rejects.toThrow("项目不存在");
    expect(mocks.readImage).not.toHaveBeenCalled();
});

test("project removal during reference hydration blocks publication", async () => {
    mocks.readImage.mockImplementation(async () => { mocks.exists = false; return "data:image/png;base64,room"; });
    await expect(localCanvasMedia.readImage("a", reference, new AbortController().signal)).rejects.toThrow("项目不存在");
});

test("cancellation during reference hydration blocks publication even when the reader ignores the signal", async () => {
    const controller = new AbortController();
    mocks.readImage.mockImplementation(async () => { controller.abort(); return "data:image/png;base64,room"; });
    await expect(localCanvasMedia.readImage("a", reference, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});

test("reference read failure is surfaced without retrying and explicit subsequent reads can succeed", async () => {
    const signal = new AbortController().signal;
    mocks.readImage.mockRejectedValueOnce(new Error("read failed")).mockResolvedValue("data:image/png;base64,room");
    await expect(localCanvasMedia.readImage("a", reference, signal)).rejects.toThrow("read failed");
    expect(mocks.readImage).toHaveBeenCalledOnce();
    await expect(localCanvasMedia.readImage("a", reference, signal)).resolves.toBe("data:image/png;base64,room");
});

const mediaReference = { name: "room.mp4", type: "video/mp4", storageKey: "video:key", url: "blob:old" };
const readMedia = (signal = new AbortController().signal) => localCanvasMedia.readMedia("a", mediaReference, signal);

test("web media bytes delegate the project reference and cancellation signal to host storage", async () => {
    const signal = new AbortController().signal;
    const blob = new Blob(["video"], { type: "video/mp4" });
    mocks.readMedia.mockResolvedValue(blob);
    await expect(readMedia(signal)).resolves.toBe(blob);
    expect(mocks.readMedia).toHaveBeenCalledExactlyOnceWith(mediaReference, signal);
});

test("cancelled or missing project media reads never enter host storage", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readMedia(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    mocks.exists = false;
    await expect(readMedia()).rejects.toThrow("项目不存在");
    expect(mocks.readMedia).not.toHaveBeenCalled();
});

test("project removal during host media read prevents publication", async () => {
    mocks.readMedia.mockImplementation(async () => { mocks.exists = false; return new Blob(["late"]); });
    await expect(readMedia()).rejects.toThrow("项目不存在");
});

test("cancellation during host media read prevents publication", async () => {
    const controller = new AbortController();
    mocks.readMedia.mockImplementation(async () => { controller.abort(); return new Blob(["late"]); });
    await expect(readMedia(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});

test("host media read errors propagate without automatic retries", async () => {
    mocks.readMedia.mockRejectedValueOnce(new Error("storage failed")).mockResolvedValue(new Blob(["video"]));
    await expect(readMedia()).rejects.toThrow("storage failed");
    expect(mocks.readMedia).toHaveBeenCalledOnce();
    await expect(readMedia()).resolves.toBeInstanceOf(Blob);
    expect(mocks.readMedia).toHaveBeenCalledTimes(2);
});
