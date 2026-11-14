import { beforeEach, expect, test, vi } from "vitest";
import { createCanvasApiMediaAdapter, restoreCanvasMedia, type CanvasMediaAdapter, type CanvasMediaSnapshot } from "../src/features/canvas/media";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasNodeData } from "../src/types/canvas";

const storage = vi.hoisted(() => ({ image: vi.fn(), media: vi.fn(), upload: vi.fn() }));
vi.mock("../../../web/src/services/image-storage", () => ({ resolveImageUrl: storage.image, uploadImage: storage.upload }));
vi.mock("../../../web/src/services/file-storage", () => ({ resolveMediaUrl: storage.media }));
vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

import { hydrateAssistantImages, hydrateCanvasImages, resetInterruptedGeneration } from "../src/lib/canvas/canvas-generation-helpers";
import { resolveCanvasReferenceImages } from "../src/lib/canvas/canvas-resource-references";
import { createMockCanvasAdapter } from "../src/services/api/canvas/mock-adapter";

const node = (id: string, type: CanvasNodeType = CanvasNodeType.Image) => ({ id, title: id, type, position: { x: 0, y: 0 }, width: 80, height: 40, metadata: { content: `blob:old-${id}`, storageKey: `${id}:key`, status: "success" as NonNullable<CanvasNodeData["metadata"]>["status"] } });
const snapshot = (): CanvasMediaSnapshot => ({ nodes: [node("image")], chatSessions: [] });

beforeEach(() => {
    vi.resetAllMocks();
    storage.image.mockImplementation(async (key, fallback) => key ? `blob:${key}` : fallback);
    storage.media.mockImplementation(async (key) => `blob:${key}`);
});

test("host receives a detached snapshot and source versions stay unchanged", async () => {
    const input = snapshot();
    const adapter: CanvasMediaAdapter = {
        readImage: vi.fn(),
        readMedia: vi.fn(),
        async restore(projectId, draft) {
            expect(projectId).toBe("project-a");
            draft.nodes[0].metadata!.content = "blob:new";
            return draft;
        },
        cleanup() {},
    };
    expect((await restoreCanvasMedia(adapter, "project-a", input, new AbortController().signal)).nodes[0].metadata?.content).toBe("blob:new");
    expect(input.nodes[0].metadata?.content).toBe("blob:old-image");
});

test("already cancelled restoration never invokes the host", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = { restore: vi.fn(), readImage: vi.fn(), readMedia: vi.fn(), cleanup: vi.fn() };
    await expect(restoreCanvasMedia(adapter, "a", snapshot(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.restore).not.toHaveBeenCalled();
});

test("late host completion after cancellation cannot publish a snapshot", async () => {
    const controller = new AbortController();
    let complete!: (value: CanvasMediaSnapshot) => void;
    const adapter: CanvasMediaAdapter = { restore: () => new Promise((resolve) => { complete = resolve; }), readImage: vi.fn(), readMedia: vi.fn(), cleanup: vi.fn() };
    const pending = restoreCanvasMedia(adapter, "a", snapshot(), controller.signal);
    controller.abort();
    complete(snapshot());
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.cleanup).not.toHaveBeenCalled();
});

test("existing local hydration restores main, alternative, video and audio URLs and identity", async () => {
    const image = { ...node("image"), metadata: { ...node("image").metadata, assetId: "asset-1", images: [{ id: "alt", content: "blob:old-alt", storageKey: "alt:key", assetId: "asset-alt", status: "success" as const, naturalWidth: 80, naturalHeight: 40, bytes: 1, mimeType: "image/png" }] } };
    const input = [image, node("video", CanvasNodeType.Video), node("audio", CanvasNodeType.Audio)];
    const original = structuredClone(input);
    const restored = await hydrateCanvasImages(input, { resolveImage: storage.image, resolveMedia: storage.media, uploadImage: storage.upload });
    expect(restored.map((item) => item.metadata?.content)).toEqual(["blob:image:key", "blob:video:key", "blob:audio:key"]);
    expect(restored[0].metadata?.assetId).toBe("asset-1");
    expect(restored[0].metadata?.images?.[0]).toMatchObject({ content: "blob:alt:key", assetId: "asset-alt" });
    expect(input).toEqual(original);
    expect(storage.upload).not.toHaveBeenCalled();
});

test("existing data URL materialization still uses the legacy image library", async () => {
    storage.upload.mockResolvedValue({ url: "blob:saved", storageKey: "image:saved", mimeType: "image/png", width: 80, height: 40 });
    const input = [{ ...node("raw"), metadata: { content: "data:image/png;base64,fixture" } }];
    const restored = await hydrateCanvasImages(input, { resolveImage: storage.image, resolveMedia: storage.media, uploadImage: storage.upload });
    expect(storage.upload).toHaveBeenCalledWith("data:image/png;base64,fixture", undefined);
    expect(restored[0].metadata).toMatchObject({ content: "blob:saved", storageKey: "image:saved" });
    expect(input[0].metadata.content).toBe("data:image/png;base64,fixture");
});

test("assistant references restore from local keys without modifying source sessions", async () => {
    const sessions: CanvasAssistantSession[] = [{ id: "chat", title: "test", createdAt: "fixture", updatedAt: "fixture", messages: [{ id: "message", role: "user", text: "room", references: [{ id: "ref", title: "room.png", type: CanvasNodeType.Image, dataUrl: "blob:old", storageKey: "image:ref" }] }] }];
    const restored = await hydrateAssistantImages(sessions, { resolveImage: storage.image, resolveMedia: storage.media, uploadImage: storage.upload });
    expect(restored[0].messages[0].references?.[0].dataUrl).toBe("blob:image:ref");
    expect(sessions[0].messages[0].references?.[0].dataUrl).toBe("blob:old");
});

test("Agent image references read through the project media adapter", async () => {
    const input = snapshot().nodes.map((item) => ({ ...item, metadata: { ...item.metadata, naturalWidth: 80, naturalHeight: 40, mimeType: "image/png", bytes: 4 } }));
    const signal = new AbortController().signal;
    const media: CanvasMediaAdapter = {
        restore: vi.fn(),
        readMedia: vi.fn(),
        readImage: vi.fn().mockResolvedValue("data:image/png;base64,fixture"),
        cleanup() {},
    };
    const references = [{ id: "image", nodeId: "image", kind: "image" as const, label: "图片 1", title: "room.png", previewUrl: "blob:room", active: true }];

    await expect(resolveCanvasReferenceImages(references, input, media, "project-a", signal)).resolves.toMatchObject([{ name: "room.png", dataUrl: "data:image/png;base64,fixture", width: 80, height: 40 }]);
    expect(media.readImage).toHaveBeenCalledWith("project-a", expect.objectContaining({ id: "image", storageKey: "image:key", dataUrl: "", url: "blob:room" }), signal);
});

test("Agent image references stop publication when the host read is cancelled", async () => {
    const controller = new AbortController();
    const media: CanvasMediaAdapter = {
        restore: vi.fn(),
        readMedia: vi.fn(),
        readImage: vi.fn(async (_projectId, _image, signal) => { controller.abort(); signal.throwIfAborted(); return "data:image/png;base64,fixture"; }),
        cleanup() {},
    };
    const references = [{ id: "image", nodeId: "image", kind: "image" as const, label: "图片 1", title: "room.png", previewUrl: "blob:room", active: true }];
    const nodes = snapshot().nodes.map((item) => ({ ...item, metadata: { ...item.metadata, naturalWidth: 80, naturalHeight: 40 } }));

    await expect(resolveCanvasReferenceImages(references, nodes, media, "project-a", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});

test("interrupted local generation resets but resumable provider video tasks survive", () => {
    const interrupted = { ...node("image"), metadata: { status: "loading" as const } };
    const resumable = { ...node("video", CanvasNodeType.Video), metadata: { status: "loading" as const, videoTaskId: "provider-task", videoTaskProvider: "grok" as const, videoTaskModel: "video-model" } };
    const restored = resetInterruptedGeneration([interrupted, resumable]);
    expect(restored[0].metadata?.status).toBe("error");
    expect(restored[1]).toEqual(resumable);
    expect(interrupted.metadata.status).toBe("loading");
});

test("Mock restore and cleanup never enter legacy storage and preserve independent loading state", async () => {
    const adapter = createMockCanvasAdapter({ sampleAsset: { name: "sample.png", url: "data:image/png;base64,fixture", mimeType: "image/png", width: 80, height: 40 } });
    const input = snapshot();
    input.nodes[0].metadata!.status = "loading";
    const restored = await restoreCanvasMedia(adapter.media, adapter.initialProjectId, input, new AbortController().signal);
    expect(restored).toEqual(input);
    expect(restored.nodes).not.toBe(input.nodes);
    adapter.media.cleanup({ projectId: adapter.initialProjectId, reason: "canvas-cleared", history: input });
    expect(storage.image).not.toHaveBeenCalled();
    expect(storage.media).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    await expect(restoreCanvasMedia(adapter.media, "missing", input, new AbortController().signal)).rejects.toThrow("项目不存在");
});

test("API media adapter reads asset bytes, restores image nodes, and keeps source snapshots detached", async () => {
    const asset = { assetId: "asset-1", projectId: "project-a", name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", url: "opaque://room", width: 2, height: 1, createdAt: "fixture" };
    const api = { getAsset: vi.fn().mockResolvedValue(asset), readAssetContent: vi.fn().mockResolvedValue(new Blob(["png"], { type: asset.mimeType })) };
    const media = createCanvasApiMediaAdapter(api);
    const input: CanvasMediaSnapshot = { nodes: [{ ...node("remote"), metadata: { ...node("remote").metadata, assetId: asset.assetId, content: "opaque://room" } }], chatSessions: [] };
    const restored = await media.restore("project-a", input, new AbortController().signal);
    expect(restored.nodes[0].metadata?.content).toBe("data:image/png;base64,cG5n");
    expect(input.nodes[0].metadata?.content).toBe("opaque://room");
    expect(api.getAsset).toHaveBeenCalledWith("project-a", asset.assetId);
    expect(api.readAssetContent).toHaveBeenCalledWith("project-a", asset.assetId, expect.any(AbortSignal));
    await expect(media.readImage("project-a", { id: "remote", assetId: asset.assetId, name: asset.name, type: asset.mimeType, dataUrl: "opaque://room" }, new AbortController().signal)).resolves.toBe("data:image/png;base64,cG5n");
});

test("API media adapter restores alternative images and assistant references by asset identity", async () => {
    const asset = (assetId: string, name: string) => ({ assetId, projectId: "project-a", name, kind: "IMAGE" as const, mimeType: "image/png", url: `opaque://${assetId}`, width: 2, height: 1, createdAt: "fixture" });
    const api = {
        getAsset: vi.fn(async (_projectId: string, assetId: string) => asset(assetId, `${assetId}.png`)),
        readAssetContent: vi.fn(async (_projectId: string, assetId: string) => new Blob([assetId], { type: "image/png" })),
    };
    const media = createCanvasApiMediaAdapter(api);
    const input: CanvasMediaSnapshot = {
        nodes: [{ ...node("remote"), metadata: { ...node("remote").metadata, assetId: "main", images: [{ id: "alternative", assetId: "alt", status: "success", content: "opaque://alt", naturalWidth: 2, naturalHeight: 1, bytes: 3, mimeType: "image/png" }] } }],
        chatSessions: [{ id: "chat", title: "design", createdAt: "fixture", updatedAt: "fixture", messages: [{ id: "message", role: "user", text: "use this room", references: [{ id: "reference", assetId: "assistant-image", type: CanvasNodeType.Image, title: "reference.png", dataUrl: "opaque://assistant-image" }] }] }],
    };

    const restored = await media.restore("project-a", input, new AbortController().signal);

    expect(restored.nodes[0].metadata).toMatchObject({ content: "data:image/png;base64,bWFpbg==", images: [{ id: "alternative", assetId: "alt", content: "data:image/png;base64,YWx0" }] });
    expect(restored.chatSessions[0].messages[0].references?.[0]).toMatchObject({ assetId: "assistant-image", dataUrl: "data:image/png;base64,YXNzaXN0YW50LWltYWdl" });
    expect(api.readAssetContent.mock.calls.map(([, assetId]) => assetId)).toEqual(expect.arrayContaining(["main", "alt", "assistant-image"]));
    expect(input.nodes[0].metadata?.content).toBe("blob:old-remote");
    expect(input.nodes[0].metadata?.images?.[0].content).toBe("opaque://alt");
    expect(input.chatSessions[0].messages[0].references?.[0].dataUrl).toBe("opaque://assistant-image");
});

test("API media adapter restores video and audio nodes from project asset bytes", async () => {
    const assets = {
        video: { assetId: "video", projectId: "project-a", name: "room.mp4", kind: "VIDEO" as const, mimeType: "video/mp4", url: "opaque://video", width: 1920, height: 1080, durationMs: 2400, createdAt: "fixture" },
        audio: { assetId: "audio", projectId: "project-a", name: "brief.mp3", kind: "AUDIO" as const, mimeType: "audio/mpeg", url: "opaque://audio", durationMs: 1800, createdAt: "fixture" },
    };
    const api = {
        getAsset: vi.fn(async (_projectId: string, assetId: string) => {
            const asset = assets[assetId as keyof typeof assets];
            if (!asset) throw new Error(`素材不存在：${assetId}`);
            return asset;
        }),
        readAssetContent: vi.fn(async (_projectId: string, assetId: string) => {
            const asset = assets[assetId as keyof typeof assets];
            if (!asset) throw new Error(`素材不存在：${assetId}`);
            return new Blob([assetId], { type: asset.mimeType });
        }),
    };
    const input: CanvasMediaSnapshot = {
        nodes: [
            { ...node("video", CanvasNodeType.Video), metadata: { ...node("video", CanvasNodeType.Video).metadata, assetId: "video", content: "opaque://video" } },
            { ...node("audio", CanvasNodeType.Audio), metadata: { ...node("audio", CanvasNodeType.Audio).metadata, assetId: "audio", content: "opaque://audio" } },
        ],
        chatSessions: [],
    };

    const restored = await createCanvasApiMediaAdapter(api).restore("project-a", input, new AbortController().signal);

    expect(restored.nodes[0].metadata).toMatchObject({ content: "data:video/mp4;base64,dmlkZW8=", mimeType: "video/mp4", naturalWidth: 1920, naturalHeight: 1080, durationMs: 2400 });
    expect(restored.nodes[1].metadata).toMatchObject({ content: "data:audio/mpeg;base64,YXVkaW8=", mimeType: "audio/mpeg", durationMs: 1800 });
    expect(input.nodes.map((item) => item.metadata?.content)).toEqual(["opaque://video", "opaque://audio"]);
});

test("API media adapter surfaces a missing alternative asset and does not publish a partial snapshot", async () => {
    const api = {
        getAsset: vi.fn(async (_projectId: string, assetId: string) => {
            if (assetId === "missing") throw new Error("素材不存在：missing");
            return { assetId, projectId: "project-a", name: "main.png", kind: "IMAGE" as const, mimeType: "image/png", url: "opaque://main", width: 2, height: 1, createdAt: "fixture" };
        }),
        readAssetContent: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
    };
    const input = snapshot();
    input.nodes[0].metadata!.assetId = "main";
    input.nodes[0].metadata!.images = [{ id: "alternative", assetId: "missing", status: "success", content: "opaque://missing", naturalWidth: 2, naturalHeight: 1, bytes: 3, mimeType: "image/png" }];
    const media = createCanvasApiMediaAdapter(api);

    await expect(media.restore("project-a", input, new AbortController().signal)).rejects.toThrow("素材不存在：missing");
    expect(input.nodes[0].metadata?.content).toBe("blob:old-image");
});

test("API media adapter reports empty asset content with a stable error code", async () => {
    const api = {
        getAsset: vi.fn().mockResolvedValue({ assetId: "empty", projectId: "project-a", name: "empty.png", kind: "IMAGE" as const, mimeType: "image/png", url: "opaque://empty", width: 2, height: 1, createdAt: "fixture" }),
        readAssetContent: vi.fn().mockResolvedValue(new Blob([], { type: "image/png" })),
    };
    const media = createCanvasApiMediaAdapter(api);

    await expect(media.readImage("project-a", { id: "empty", assetId: "empty", name: "empty.png", type: "image/png", dataUrl: "" }, new AbortController().signal)).rejects.toMatchObject({ name: "CanvasApiError", code: "ASSET_CONTENT_MISSING" });
});

test("API media adapter rejects mismatched project or asset identities before reading bytes", async () => {
    const requested = { id: "requested", assetId: "requested", name: "requested.png", type: "image/png", dataUrl: "" };
    const api = {
        getAsset: vi.fn().mockResolvedValueOnce({ assetId: "requested", projectId: "other-project", name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", url: "opaque://room", width: 2, height: 1, createdAt: "fixture" }).mockResolvedValueOnce({ assetId: "other-asset", projectId: "project-a", name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", url: "opaque://room", width: 2, height: 1, createdAt: "fixture" }),
        readAssetContent: vi.fn(),
    };
    const media = createCanvasApiMediaAdapter(api);

    await expect(media.readImage("project-a", requested, new AbortController().signal)).rejects.toMatchObject({ code: "ASSET_PROJECT_MISMATCH" });
    await expect(media.readImage("project-a", requested, new AbortController().signal)).rejects.toMatchObject({ code: "ASSET_ID_MISMATCH" });
    expect(api.readAssetContent).not.toHaveBeenCalled();
});

test("API media adapter rejects a late asset body after cancellation", async () => {
    const controller = new AbortController();
    let complete!: (blob: Blob) => void;
    const api = {
        getAsset: vi.fn().mockResolvedValue({ assetId: "late", projectId: "project-a", name: "late.png", kind: "IMAGE" as const, mimeType: "image/png", url: "opaque://late", width: 2, height: 1, createdAt: "fixture" }),
        readAssetContent: vi.fn(() => new Promise<Blob>((resolve) => { complete = resolve; })),
    };
    const media = createCanvasApiMediaAdapter(api);
    const pending = media.readImage("project-a", { id: "late", assetId: "late", name: "late.png", type: "image/png", dataUrl: "" }, controller.signal);

    await vi.waitFor(() => expect(api.readAssetContent).toHaveBeenCalled());
    controller.abort();
    complete(new Blob(["late"], { type: "image/png" }));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

test("API media adapter stops before content reads when cancelled and rejects missing media", async () => {
    const controller = new AbortController();
    controller.abort();
    const api = { getAsset: vi.fn(), readAssetContent: vi.fn() };
    const media = createCanvasApiMediaAdapter(api);
    await expect(media.readImage("project-a", { id: "remote", assetId: "missing", name: "missing.png", type: "image/png", dataUrl: "" }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(api.getAsset).not.toHaveBeenCalled();
    await expect(media.readImage("project-a", { id: "remote", name: "missing.png", type: "image/png", dataUrl: "" }, new AbortController().signal)).rejects.toThrow("无法读取参考素材");
});
