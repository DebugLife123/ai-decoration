import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CanvasAsset, RegisterCanvasAsset } from "../src/features/canvas/contracts";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
const { importCanvasAudio, importCanvasImage, importCanvasVideo, canvasAssetMetadata, applyCanvasAssetCommandMetadata } = await import("../src/features/canvas/asset-import");
const { createCanvasHttpHostAdapters } = await import("../src/services/api/canvas/http-host-adapters");

const file = { name: "room.png", type: "image/png", size: 42 } as File;
const asset: CanvasAsset = { projectId: "project", assetId: "asset", name: file.name, kind: "IMAGE", mimeType: file.type, url: "data:image/png;base64,fixture", width: 960, height: 640, createdAt: "fixture" };

describe("canvas image import boundary", () => {
    test("applies task and version identities to an already imported asset node", () => {
        const metadata = applyCanvasAssetCommandMetadata({ assetId: "asset-1", prompt: "keep me" }, { taskId: "task-1", versionId: "version-1" });
        expect(metadata).toMatchObject({ assetId: "asset-1", prompt: "keep me", taskId: "task-1", versionId: "version-1", status: "success" });
        expect(applyCanvasAssetCommandMetadata(metadata, {})).toEqual(metadata);
        expect(applyCanvasAssetCommandMetadata({ assetId: "asset-1" }, { versionId: "version-1" })).not.toHaveProperty("status");
    });

    beforeEach(() => {
        vi.stubGlobal("FileReader", class {
            result = asset.url;
            onload = () => undefined;
            readAsDataURL = vi.fn(() => this.onload());
        });
        vi.stubGlobal("Image", class {
            naturalWidth = asset.width;
            naturalHeight = asset.height;
            decode = async () => undefined;
        });
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test("passes project identity and decoded image dimensions to the API", async () => {
        const uploadAsset = vi.fn().mockResolvedValue(asset);
        const result = await importCanvasImage({ uploadAsset }, "project", file);
        expect(uploadAsset).toHaveBeenCalledWith({ projectId: "project", name: file.name, mimeType: file.type, url: asset.url, width: 960, height: 640 });
        expect(result).toEqual({ ...asset, bytes: 42 });
        expect(canvasAssetMetadata(result)).toMatchObject({ assetId: "asset", naturalWidth: 960, naturalHeight: 640, bytes: 42, content: asset.url });
    });

    test("uses the object-storage ticket lifecycle when the host provides it", async () => {
        const ticket = { uploadId: "upload-1", projectId: "project", method: "PUT" as const, uploadUrl: "https://storage.example/upload", headers: { "Content-Type": file.type } };
        const storageRef = { kind: "OBJECT_STORAGE" as const, key: "project/asset", mimeType: file.type, bytes: file.size };
        const registered = { ...asset, url: storageRef.key, storageRef };
        const api = {
            createUploadTicket: vi.fn().mockResolvedValue(ticket),
            completeUpload: vi.fn().mockResolvedValue(storageRef),
            registerAsset: vi.fn().mockResolvedValue(registered),
        };
        const uploadBinary = vi.fn().mockResolvedValue(undefined);
        const result = await importCanvasImage(api, "project", file, uploadBinary);
        expect(api.createUploadTicket).toHaveBeenCalledWith({ projectId: "project", name: file.name, mimeType: file.type, bytes: file.size });
        expect(uploadBinary).toHaveBeenCalledWith(ticket, file);
        expect(api.completeUpload).toHaveBeenCalledWith({ projectId: "project", uploadId: ticket.uploadId });
        expect(api.registerAsset).toHaveBeenCalledWith({ projectId: "project", uploadId: ticket.uploadId, name: file.name, mimeType: file.type, kind: "IMAGE", width: 960, height: 640 });
        expect(result).toMatchObject({ assetId: "asset", storageRef, bytes: file.size });
    });

    test("imports video and audio through the shared ticket lifecycle with media metadata", async () => {
        const originalCreateElement = document.createElement.bind(document);
        vi.stubGlobal("URL", { createObjectURL: vi.fn((mediaFile: File) => `blob:${mediaFile.name}`), revokeObjectURL: vi.fn() });
        vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
            if (tagName !== "video" && tagName !== "audio") return originalCreateElement(tagName);
            const media = {
                duration: tagName === "video" ? 2.4 : 1.8,
                videoWidth: tagName === "video" ? 1280 : undefined,
                videoHeight: tagName === "video" ? 720 : undefined,
                onloadedmetadata: null as null | (() => void),
                onerror: null as null | (() => void),
                preload: "",
                removeAttribute: vi.fn(),
                load: vi.fn(),
                set src(_value: string) { this.onloadedmetadata?.(); },
            };
            return media;
        }) as unknown as typeof document.createElement);
        const ticket = { uploadId: "upload-media", projectId: "project", method: "PUT" as const, uploadUrl: "mock://upload", headers: {} };
        const storageRef = { kind: "OBJECT_STORAGE" as const, key: "project/media", mimeType: "application/octet-stream" };
        const api = {
            createUploadTicket: vi.fn().mockResolvedValue(ticket),
            uploadBinary: vi.fn().mockResolvedValue(undefined),
            completeUpload: vi.fn().mockResolvedValue(storageRef),
            registerAsset: vi.fn(async (input: RegisterCanvasAsset) => ({ ...input, assetId: input.kind === "VIDEO" ? "video" : "audio", url: storageRef.key, createdAt: "fixture" })),
            deleteAsset: vi.fn().mockResolvedValue(undefined),
            cancelUpload: vi.fn().mockResolvedValue(undefined),
        };
        const videoFile = new File(["video"], "room.mp4", { type: "video/mp4" });
        const audioFile = new File(["audio"], "brief.mp3", { type: "audio/mpeg" });

        await expect(importCanvasVideo(api, "project", videoFile)).resolves.toMatchObject({ assetId: "video", kind: "VIDEO", width: 1280, height: 720, durationMs: 2400, bytes: videoFile.size });
        await expect(importCanvasAudio(api, "project", audioFile)).resolves.toMatchObject({ assetId: "audio", kind: "AUDIO", durationMs: 1800, bytes: audioFile.size });
        expect(api.registerAsset).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: "VIDEO", width: 1280, height: 720, durationMs: 2400 }));
        expect(api.registerAsset).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: "AUDIO", durationMs: 1800 }));
    });

    test("does not complete or register a ticket when binary upload fails", async () => {
        const api = { createUploadTicket: vi.fn().mockResolvedValue({ uploadId: "upload-1", projectId: "project", method: "PUT" as const, uploadUrl: "mock://upload", headers: {} }), cancelUpload: vi.fn().mockResolvedValue(undefined), completeUpload: vi.fn(), registerAsset: vi.fn() };
        await expect(importCanvasImage(api, "project", file, async () => { throw new Error("storage unavailable"); })).rejects.toThrow("storage unavailable");
        expect(api.cancelUpload).toHaveBeenCalledWith({ projectId: "project", uploadId: "upload-1" });
        expect(api.completeUpload).not.toHaveBeenCalled();
        expect(api.registerAsset).not.toHaveBeenCalled();
    });

    test("cancels a ticket when registration fails after completion", async () => {
        const ticket = { uploadId: "upload-2", projectId: "project", method: "PUT" as const, uploadUrl: "mock://upload", headers: {} };
        const api = {
            createUploadTicket: vi.fn().mockResolvedValue(ticket),
            cancelUpload: vi.fn().mockResolvedValue(undefined),
            completeUpload: vi.fn().mockResolvedValue({ kind: "OBJECT_STORAGE" as const, key: "project/asset", mimeType: file.type }),
            registerAsset: vi.fn().mockRejectedValue(new Error("register failed")),
        };
        await expect(importCanvasImage(api, "project", file, vi.fn().mockResolvedValue(undefined))).rejects.toThrow("register failed");
        expect(api.cancelUpload).toHaveBeenCalledWith({ projectId: "project", uploadId: ticket.uploadId });
    });

    test("removes a registered asset when cancellation wins immediately after registration", async () => {
        const controller = new AbortController();
        const ticket = { uploadId: "upload-3", projectId: "project", method: "PUT" as const, uploadUrl: "mock://upload", headers: {} };
        const deleteAsset = vi.fn().mockResolvedValue(undefined);
        const api = {
            createUploadTicket: vi.fn().mockResolvedValue(ticket),
            cancelUpload: vi.fn().mockResolvedValue(undefined),
            completeUpload: vi.fn().mockResolvedValue({ kind: "OBJECT_STORAGE" as const, key: "project/asset", mimeType: file.type }),
            registerAsset: vi.fn().mockImplementation(async () => {
                controller.abort();
                return asset;
            }),
            deleteAsset,
        };
        await expect(importCanvasImage(api, "project", file, vi.fn().mockResolvedValue(undefined), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(deleteAsset).toHaveBeenCalledWith("project", asset.assetId);
        expect(api.cancelUpload).toHaveBeenCalledWith({ projectId: "project", uploadId: ticket.uploadId });
    });

    test("rejects before touching the host when import is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const uploadAsset = vi.fn();
        await expect(importCanvasImage({ uploadAsset }, "project", file, undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(uploadAsset).not.toHaveBeenCalled();
    });

    test("does not complete or register after the binary upload aborts the import", async () => {
        const controller = new AbortController();
        const api = {
            createUploadTicket: vi.fn().mockResolvedValue({ uploadId: "upload-1", projectId: "project", method: "PUT" as const, uploadUrl: "mock://upload", headers: {} }),
            completeUpload: vi.fn(),
            registerAsset: vi.fn(),
        };
        const uploadBinary = vi.fn().mockImplementation(async (_ticket, _file, signal?: AbortSignal) => {
            expect(signal).toBe(controller.signal);
            controller.abort();
        });
        await expect(importCanvasImage(api, "project", file, uploadBinary, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(uploadBinary).toHaveBeenCalledWith(expect.anything(), file, controller.signal);
        expect(api.completeUpload).not.toHaveBeenCalled();
        expect(api.registerAsset).not.toHaveBeenCalled();
    });

    test("imports an image through the composed HTTP host upload bundle", async () => {
        const ticket = { uploadId: "upload-http", projectId: "project", method: "PUT" as const, uploadUrl: "https://storage.example/upload", headers: { "Content-Type": file.type } };
        const storageRef = { kind: "OBJECT_STORAGE" as const, key: "project/room.png", mimeType: file.type, bytes: file.size };
        const registered = { ...asset, url: storageRef.key, storageRef };
        const response = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
        const transport = vi.fn()
            .mockResolvedValueOnce(response(ticket, 201))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(response(storageRef, 200))
            .mockResolvedValueOnce(response(registered, 201));
        const host = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: transport });
        await expect(importCanvasImage(host.uploads, "project", file)).resolves.toMatchObject({ assetId: asset.assetId, storageRef, bytes: file.size });
        expect(transport).toHaveBeenNthCalledWith(2, ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
        expect(transport).toHaveBeenNthCalledWith(3, "https://canvas.example/api/v1/projects/project/assets/uploads/upload-http/complete", expect.objectContaining({ method: "POST" }));
        expect(transport).toHaveBeenNthCalledWith(4, "https://canvas.example/api/v1/projects/project/assets/register", expect.objectContaining({ method: "POST" }));
    });

    test("stops the composed HTTP import before completion when the storage PUT fails", async () => {
        const ticket = { uploadId: "upload-http", projectId: "project", method: "PUT" as const, uploadUrl: "https://storage.example/upload", headers: { "Content-Type": file.type } };
        const response = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
        const transport = vi.fn()
            .mockResolvedValueOnce(response(ticket, 201))
            .mockResolvedValueOnce(new Response("storage denied", { status: 403 }));
        const host = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: transport });
        await expect(importCanvasImage(host.uploads, "project", file)).rejects.toMatchObject({ code: "UPLOAD_HTTP_403" });
        expect(transport).toHaveBeenCalledTimes(2);
    });

    test("rejects unsupported files before creating an asset", async () => {
        const uploadAsset = vi.fn();
        await expect(importCanvasImage({ uploadAsset }, "project", { ...file, type: "video/mp4" } as File)).rejects.toThrow("仅接收图片");
        expect(uploadAsset).not.toHaveBeenCalled();
    });

    test("decode failure creates no partial asset", async () => {
        vi.stubGlobal("Image", class { decode = async () => { throw new Error("decode failed"); }; });
        const uploadAsset = vi.fn();
        await expect(importCanvasImage({ uploadAsset }, "project", file)).rejects.toThrow("无法读取图片：room.png");
        expect(uploadAsset).not.toHaveBeenCalled();
    });

    test("file read failure creates no partial asset", async () => {
        vi.stubGlobal("FileReader", class {
            onerror = () => undefined;
            readAsDataURL = () => this.onerror();
        });
        const uploadAsset = vi.fn();
        await expect(importCanvasImage({ uploadAsset }, "project", file)).rejects.toThrow();
        expect(uploadAsset).not.toHaveBeenCalled();
    });

    test("invalid dimensions are rejected without writing an asset", async () => {
        vi.stubGlobal("Image", class { naturalWidth = 0; naturalHeight = 0; decode = async () => undefined; });
        const uploadAsset = vi.fn();
        await expect(importCanvasImage({ uploadAsset }, "project", file)).rejects.toThrow("图片尺寸无效");
        expect(uploadAsset).not.toHaveBeenCalled();
    });

    test("does not accept an asset from a different project", async () => {
        const uploadAsset = vi.fn().mockResolvedValue({ ...asset, projectId: "other" });
        await expect(importCanvasImage({ uploadAsset }, "project", file)).rejects.toThrow("上传结果不属于当前项目");
    });

    test("propagates adapter errors rather than returning a usable result", async () => {
        const uploadAsset = vi.fn().mockRejectedValue(new Error("upload failed"));
        await expect(importCanvasImage({ uploadAsset }, "project", file)).rejects.toThrow("upload failed");
    });

    test("replacement keeps local storage references but clears previous task and version identity", () => {
        const previous = { storageKey: "image:old", assetId: "old", taskId: "old-task", versionId: "old-version" };
        expect({ ...previous, ...canvasAssetMetadata(asset) }).toMatchObject({ storageKey: undefined, assetId: "asset", taskId: undefined, versionId: undefined });
        expect(canvasAssetMetadata({ ...asset, storageKey: "image:new", bytes: 42 })).toMatchObject({ storageKey: "image:new", bytes: 42 });
    });

    test("video replacement carries dimensions and duration but clears generation identity", () => {
        const video = { ...asset, kind: "VIDEO" as const, mimeType: "video/mp4", storageKey: "video:new", bytes: 42, durationMs: 1500 };
        const previous = { taskId: "task", versionId: "version", videoTaskId: "legacy", videoTaskProvider: "provider", videoTaskModel: "model" };
        expect({ ...previous, ...canvasAssetMetadata(video) }).toMatchObject({ assetId: asset.assetId, storageKey: "video:new", durationMs: 1500, taskId: undefined, versionId: undefined, videoTaskId: undefined, videoTaskProvider: undefined, videoTaskModel: undefined });
        expect(canvasAssetMetadata(asset).durationMs).toBeUndefined();
    });

    test("audio metadata carries duration and identity without image dimensions or stale tasks", () => {
        const { width: _width, height: _height, ...base } = asset;
        const audio = { ...base, kind: "AUDIO" as const, mimeType: "audio/mpeg", storageKey: "audio:new", bytes: 42, durationMs: 1500 };
        expect(canvasAssetMetadata(audio)).toMatchObject({ assetId: asset.assetId, content: asset.url, storageKey: "audio:new", bytes: 42, durationMs: 1500, naturalWidth: undefined, naturalHeight: undefined, taskId: undefined, versionId: undefined, videoTaskId: undefined });
    });
});
