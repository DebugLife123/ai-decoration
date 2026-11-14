import { describe, expect, test, vi } from "vitest";
import { CanvasApiError } from "../src/features/canvas/contracts";
import { createCanvasHttpAdapter, createCanvasHttpBinaryUploader } from "../src/services/api/canvas/http-adapter";

const project = { projectId: "project/1", name: "Living room", createdAt: "created", updatedAt: "updated" };
const response = (body: unknown, status = 200) => new Response(body === undefined ? undefined : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const asset = { assetId: "asset-1", projectId: project.projectId, name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", url: "data:image/png;base64,room", width: 10, height: 10, createdAt: "created" };
const task = { taskId: "task/1", projectId: project.projectId, type: "GENERATE" as const, status: "RUNNING" as const, sourceAssetId: asset.assetId, sourceVersionId: null, resultAssetId: null, versionId: null, error: null, createdAt: "created", updatedAt: "updated" };
const version = { versionId: "version-1", projectId: project.projectId, sourceAssetId: null, resultAssetId: asset.assetId, createdAt: "created", name: "Draft" };
const document = { projectId: project.projectId, nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines" as const, showImageInfo: false, viewport: { x: 0, y: 0, k: 1 }, currentVersionId: null };
const versionWrite = { title: "Draft", createdAt: "created", nodes: [], connections: [], backgroundMode: "lines" as const, showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } };

describe("Canvas HTTP adapter", () => {
    test("uploads ticket bytes through an injectable transport and preserves ticket headers", async () => {
        const transport = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        const upload = createCanvasHttpBinaryUploader(transport);
        const ticket = { uploadId: "upload-1", projectId: project.projectId, method: "PUT" as const, uploadUrl: "https://storage.example/object", headers: { "Content-Type": "image/png", "x-test": "signed" } };
        const file = new File([new Uint8Array([1, 2, 3])], "room.png", { type: "image/png" });
        await expect(upload(ticket, file)).resolves.toBeUndefined();
        expect(transport).toHaveBeenCalledWith(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
    });

    test("maps binary upload network and status failures without exposing file contents", async () => {
        const networkUpload = createCanvasHttpBinaryUploader(vi.fn().mockRejectedValue(new Error("storage offline")));
        const ticket = { uploadId: "upload-1", projectId: project.projectId, method: "PUT" as const, uploadUrl: "https://storage.example/object", headers: {} };
        const file = new File(["secret-bytes"], "room.png", { type: "image/png" });
        await expect(networkUpload(ticket, file)).rejects.toMatchObject({ code: "UPLOAD_NETWORK_ERROR", message: "storage offline" });

        const rejectedUpload = createCanvasHttpBinaryUploader(vi.fn().mockResolvedValue(new Response("provider failure", { status: 403 })));
        await expect(rejectedUpload(ticket, file)).rejects.toMatchObject({ code: "UPLOAD_HTTP_403", details: { uploadId: "upload-1" } });
        await expect(rejectedUpload(ticket, file)).rejects.not.toMatchObject({ message: expect.stringContaining("secret-bytes") });
    });

    test("honors an already-aborted upload signal before invoking storage", async () => {
        const transport = vi.fn();
        const upload = createCanvasHttpBinaryUploader(transport);
        const controller = new AbortController();
        controller.abort();
        const ticket = { uploadId: "upload-1", projectId: project.projectId, method: "PUT" as const, uploadUrl: "https://storage.example/object", headers: {} };
        await expect(upload(ticket, new File(["bytes"], "room.png"), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(transport).not.toHaveBeenCalled();
    });

    test("preserves an abort raised by the storage transport and does not remap it", async () => {
        const controller = new AbortController();
        const transport = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            controller.abort();
            init?.signal?.throwIfAborted();
            return new Response(null, { status: 204 });
        });
        const upload = createCanvasHttpBinaryUploader(transport);
        const ticket = { uploadId: "upload-1", projectId: project.projectId, method: "PUT" as const, uploadUrl: "https://storage.example/object", headers: {} };
        await expect(upload(ticket, new File(["bytes"], "room.png"), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        await expect(upload(ticket, new File(["bytes"], "room.png"), controller.signal)).rejects.not.toMatchObject({ code: "UPLOAD_NETWORK_ERROR" });
    });

    test("preserves an abort raised by a JSON task request", async () => {
        const controller = new AbortController();
        const transport = vi.fn().mockImplementation(async () => {
            controller.abort();
            throw new DOMException("The operation was aborted.", "AbortError");
        });
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });

        await expect(api.getTask(task.taskId, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        await expect(api.getTask(task.taskId, controller.signal)).rejects.not.toMatchObject({ code: "NETWORK_ERROR" });
    });

    test("passes cancellation signals to asset and version list requests", async () => {
        const controller = new AbortController();
        const transport = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            controller.abort();
            throw new DOMException("The operation was aborted.", "AbortError");
        });
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });

        await expect(api.listAssets(project.projectId, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        await expect(api.listVersions(project.projectId, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(transport.mock.calls[0][1]?.signal).toBe(controller.signal);
        expect(transport.mock.calls[1][1]?.signal).toBe(controller.signal);
    });

    test("passes cancellation signals to project documents and version snapshots", async () => {
        const fullVersion = { ...versionWrite, versionId: version.versionId, projectId: project.projectId };
        const documentTransport = vi.fn().mockResolvedValue(response(document));
        const documentApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: documentTransport });
        const documentSignal = new AbortController().signal;
        await documentApi.getProjectDocument(project.projectId, documentSignal);
        expect(documentTransport).toHaveBeenCalledWith("https://canvas.example/api/v1/projects/project%2F1/document", expect.objectContaining({ method: "GET", signal: documentSignal }));

        const versionTransport = vi.fn().mockResolvedValue(response(fullVersion));
        const versionApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: versionTransport });
        const versionSignal = new AbortController().signal;
        await versionApi.getProjectVersion(project.projectId, version.versionId, versionSignal);
        expect(versionTransport).toHaveBeenCalledWith("https://canvas.example/api/v1/projects/project%2F1/versions/version-1", expect.objectContaining({ method: "GET", signal: versionSignal }));
    });

    test("maps JSON requests, encodes identifiers, and preserves 202 task acceptance", async () => {
        const transport = vi.fn()
            .mockResolvedValueOnce(response(project, 201))
            .mockResolvedValueOnce(response([project], 200))
            .mockResolvedValueOnce(response([], 200))
            .mockResolvedValueOnce(response({ status: 202, taskId: "task-1" }, 202));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example/", fetch: transport, headers: { Authorization: "Bearer test" } });

        expect(await api.createProject("Living room")).toEqual(project);
        expect(await api.listProjects()).toEqual([project]);
        expect(await api.listAssets(project.projectId)).toEqual([]);
        const editTask = { projectId: project.projectId, type: "EDIT" as const, prompt: "mask edit", sourceAssetId: "source-1", sourceVersionId: "version-1", referenceAssetIds: ["source-1", "mask-1"], image: { model: "fixture", quality: "high", size: "1024x1024", background: "auto" } };
        expect(await api.submitTask(editTask)).toEqual({ status: 202, taskId: "task-1" });
        expect(transport).toHaveBeenNthCalledWith(1, "https://canvas.example/api/v1/projects", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Living room" }) }));
        expect(transport).toHaveBeenNthCalledWith(2, "https://canvas.example/api/v1/projects", expect.objectContaining({ method: "GET" }));
        expect(transport).toHaveBeenNthCalledWith(4, "https://canvas.example/api/v1/tasks", expect.objectContaining({ method: "POST", body: JSON.stringify(editTask) }));
        expect(new Headers(transport.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer test");
        expect(new Headers(transport.mock.calls[0][1]?.headers).get("content-type")).toBe("application/json");
        expect(new Headers(transport.mock.calls[2][1]?.headers).get("accept")).toBe("application/json");
    });

    test("maps task submission to a host route and normalizes its response", async () => {
        const transport = vi.fn().mockResolvedValue(response({ id: "render-1" }, 201));
        const api = createCanvasHttpAdapter({
            baseUrl: "https://canvas.example",
            fetch: transport,
            taskSubmission: (input) => ({
                path: `/api/v1/projects/${encodeURIComponent(input.projectId)}/${input.type === "EDIT" ? "edits" : "renders"}`,
                body: { prompt: input.prompt, sourceAssetId: input.sourceAssetId },
                expectedStatus: 201,
                mapResponse: (payload) => ({ status: 202, taskId: String((payload as { id?: unknown }).id || "") }),
            }),
        });
        const input = { projectId: project.projectId, type: "EDIT" as const, prompt: "调整空间", sourceAssetId: "source-1" };

        await expect(api.submitTask(input)).resolves.toEqual({ status: 202, taskId: "render-1" });
        expect(transport).toHaveBeenCalledWith("https://canvas.example/api/v1/projects/project%2F1/edits", expect.objectContaining({ method: "POST", body: JSON.stringify({ prompt: input.prompt, sourceAssetId: input.sourceAssetId }) }));
    });

    test("unwraps ApiResponse data when explicitly configured", async () => {
        const transport = vi.fn().mockResolvedValue(response({ code: "OK", message: "success", data: project, timestamp: "now" }));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport, responseEnvelope: "data" });

        await expect(api.getProject(project.projectId)).resolves.toEqual(project);
    });

    test("unwraps ApiResponse data for Canvas document, asset, task, and version DTOs", async () => {
        const accepted = { status: 202, taskId: "task-accepted" };
        const envelope = (data: unknown) => response({ code: "OK", message: "success", data, timestamp: "now" });
        const transport = vi.fn()
            .mockResolvedValueOnce(envelope([project]))
            .mockResolvedValueOnce(envelope(document))
            .mockResolvedValueOnce(envelope([asset]))
            .mockResolvedValueOnce(response({ code: "OK", message: "success", data: accepted, timestamp: "now" }, 202))
            .mockResolvedValueOnce(envelope(task))
            .mockResolvedValueOnce(envelope([version]));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport, responseEnvelope: "data" });

        await expect(api.listProjects()).resolves.toEqual([project]);
        await expect(api.getProjectDocument(project.projectId)).resolves.toEqual(document);
        await expect(api.listAssets(project.projectId)).resolves.toEqual([asset]);
        await expect(api.submitTask({ projectId: project.projectId, type: "GENERATE", prompt: "room" })).resolves.toEqual(accepted);
        await expect(api.getTask(task.taskId)).resolves.toEqual(task);
        await expect(api.listVersions(project.projectId)).resolves.toEqual([version]);
    });

    test("keeps ApiResponse errors intact when response envelope mode is enabled", async () => {
        const transport = vi.fn().mockResolvedValue(response({ code: "PROJECT_NOT_FOUND", message: "项目不存在", data: null }, 404));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport, responseEnvelope: "data" });

        await expect(api.getProject(project.projectId)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND", message: "项目不存在" });
    });

    test("passes cancellation signals to project list requests", async () => {
        const transport = vi.fn().mockResolvedValue(response([project]));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });
        const signal = new AbortController().signal;

        await expect(api.listProjects(signal)).resolves.toEqual([project]);
        expect(transport).toHaveBeenCalledWith("https://canvas.example/api/v1/projects", expect.objectContaining({ method: "GET", signal }));
    });

    test("passes task submission cancellation to transport without serializing it", async () => {
        const transport = vi.fn().mockResolvedValue(response({ status: 202, taskId: "task-1" }, 202));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });
        const signal = new AbortController().signal;
        const input = { projectId: project.projectId, type: "GENERATE" as const, prompt: "room" };

        await api.submitTask(input, { signal });

        expect(transport).toHaveBeenCalledWith("https://canvas.example/api/v1/tasks", expect.objectContaining({ method: "POST", body: JSON.stringify(input), signal }));
    });

    test("does not send task submission when its signal is already aborted", async () => {
        const transport = vi.fn();
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });
        const controller = new AbortController();
        controller.abort();

        await expect(api.submitTask({ projectId: project.projectId, type: "GENERATE", prompt: "room" }, { signal: controller.signal })).rejects.toThrow();
        expect(transport).not.toHaveBeenCalled();
    });

    test("maps the remaining project, asset, task, and version operations", async () => {
        const transport = vi.fn()
            .mockResolvedValueOnce(response(project))
            .mockResolvedValueOnce(response(asset, 201))
            .mockResolvedValueOnce(response(task))
            .mockResolvedValueOnce(response([version]));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });

        expect(await api.getProject(project.projectId)).toEqual(project);
        expect(await api.uploadAsset({ projectId: project.projectId, name: asset.name, mimeType: asset.mimeType, url: asset.url, width: asset.width, height: asset.height })).toEqual(asset);
        expect(await api.getTask(task.taskId)).toEqual(task);
        expect(await api.listVersions(project.projectId)).toEqual([version]);
        expect(transport.mock.calls.map(([url]) => url)).toEqual([
            "https://canvas.example/api/v1/projects/project%2F1",
            "https://canvas.example/api/v1/projects/project%2F1/assets",
            "https://canvas.example/api/v1/tasks/task%2F1",
            "https://canvas.example/api/v1/projects/project%2F1/versions",
        ]);
        expect(JSON.parse(transport.mock.calls[1][1]?.body as string)).toMatchObject({ projectId: project.projectId, name: asset.name });
    });

    test("rejects task payloads that violate the shared terminal-state contract", async () => {
        const invalidTasks = [
            { ...task, status: "SUCCEEDED", resultAssetId: null, versionId: null },
            { ...task, status: "FAILED", error: null },
            { ...task, status: "RUNNING", resultAssetId: asset.assetId, versionId: null },
        ];
        for (const invalidTask of invalidTasks) {
            const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response(invalidTask)) });
            await expect(api.getTask(task.taskId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
        }
    });

    test("accepts opaque object storage references but rejects malformed references", async () => {
        const storedAsset = { ...asset, storageRef: { kind: "OBJECT_STORAGE", key: "projects/p/assets/a", mimeType: "image/png", bytes: 42 } };
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response([storedAsset])) });
        await expect(api.listAssets(project.projectId)).resolves.toEqual([storedAsset]);
        const invalidApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...asset, storageRef: { kind: "OBJECT_STORAGE", key: "", mimeType: "image/png" } })) });
        await expect(invalidApi.listAssets(project.projectId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });

    test("accepts video and audio asset DTOs and rejects invalid media metadata", async () => {
        const video = { ...asset, assetId: "video-1", name: "room.mp4", kind: "VIDEO" as const, mimeType: "video/mp4", width: 1920, height: 1080, durationMs: 2400 };
        const { width: _width, height: _height, ...base } = asset;
        const audio = { ...base, assetId: "audio-1", name: "brief.mp3", kind: "AUDIO" as const, mimeType: "audio/mpeg", durationMs: 1800 };
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response([video, audio])) });
        await expect(api.listAssets(project.projectId)).resolves.toEqual([video, audio]);

        const invalidVideoApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response([{ ...video, width: 0 }])) });
        await expect(invalidVideoApi.listAssets(project.projectId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
        const invalidAudioApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response([{ ...audio, durationMs: -1 }])) });
        await expect(invalidAudioApi.listAssets(project.projectId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });

    test("maps object storage ticket, completion, and asset registration commands", async () => {
        const ticket = { uploadId: "upload-1", projectId: project.projectId, method: "PUT" as const, uploadUrl: "https://storage.example/upload", headers: { "Content-Type": "image/png" } };
        const storageRef = { kind: "OBJECT_STORAGE" as const, key: "projects/p/assets/a", mimeType: "image/png", bytes: 12 };
        const registered = { ...asset, storageRef };
        const transport = vi.fn()
            .mockResolvedValueOnce(response(ticket, 201))
            .mockResolvedValueOnce(response(storageRef))
            .mockResolvedValueOnce(response(registered, 201));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });
        await expect(api.createUploadTicket({ projectId: project.projectId, name: asset.name, mimeType: asset.mimeType, bytes: 12 })).resolves.toEqual(ticket);
        await expect(api.completeUpload({ projectId: project.projectId, uploadId: ticket.uploadId })).resolves.toEqual(storageRef);
        await expect(api.registerAsset({ projectId: project.projectId, uploadId: ticket.uploadId, name: asset.name, mimeType: asset.mimeType, kind: "IMAGE", width: 10, height: 10 })).resolves.toEqual(registered);
        expect(transport.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
            ["https://canvas.example/api/v1/projects/project%2F1/assets/upload-ticket", "POST"],
            ["https://canvas.example/api/v1/projects/project%2F1/assets/uploads/upload-1/complete", "POST"],
            ["https://canvas.example/api/v1/projects/project%2F1/assets/register", "POST"],
        ]);
        expect(JSON.parse(transport.mock.calls[1][1]?.body as string)).toEqual({ uploadId: ticket.uploadId });
    });

    test("maps upload cancellation and unreferenced asset deletion commands", async () => {
        const transport = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });
        await api.cancelUpload({ projectId: project.projectId, uploadId: "upload-1" });
        await api.deleteAsset(project.projectId, asset.assetId);
        expect(transport.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
            ["https://canvas.example/api/v1/projects/project%2F1/assets/uploads/upload-1", "DELETE"],
            ["https://canvas.example/api/v1/projects/project%2F1/assets/asset-1", "DELETE"],
        ]);
    });

    test("reads asset metadata and binary content with project scope and abort signal", async () => {
        const controller = new AbortController();
        const transport = vi.fn().mockResolvedValueOnce(response(asset)).mockResolvedValueOnce(new Response("image bytes", { status: 200, headers: { "content-type": "image/png" } }));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });
        await expect(api.getAsset(project.projectId, asset.assetId)).resolves.toEqual(asset);
        await expect(api.readAssetContent(project.projectId, asset.assetId, controller.signal).then((blob) => blob.text())).resolves.toBe("image bytes");
        expect(transport.mock.calls.map(([url]) => url)).toEqual([
            "https://canvas.example/api/v1/projects/project%2F1/assets/asset-1",
            "https://canvas.example/api/v1/projects/project%2F1/assets/asset-1/content",
        ]);
        expect(transport.mock.calls[1][1]).toMatchObject({ method: "GET", signal: controller.signal });
        expect(new Headers(transport.mock.calls[1][1]?.headers).get("accept")).toBe("application/octet-stream");
    });

    test("rejects an asset response whose identity differs from the requested path", async () => {
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...asset, assetId: "different-asset" })) });
        await expect(api.getAsset(project.projectId, asset.assetId)).rejects.toMatchObject({ name: "CanvasApiError", code: "INVALID_RESPONSE" });
    });

    test("maps full document and version commands, including empty 204 responses", async () => {
        const transport = vi.fn()
            .mockResolvedValueOnce(response(document))
            .mockResolvedValueOnce(response(undefined, 204))
            .mockResolvedValueOnce(response({ ...versionWrite, versionId: "version-2", projectId: project.projectId }, 201))
            .mockResolvedValueOnce(response(undefined, 204));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });

        expect(await api.getProjectDocument(project.projectId)).toEqual(document);
        await expect(api.saveProjectDocument(project.projectId, document)).resolves.toBeUndefined();
        await expect(api.saveProjectDocument("wrong-project", document)).rejects.toMatchObject({ code: "PROJECT_ID_MISMATCH" });
        expect(await api.saveProjectVersion(project.projectId, versionWrite)).toMatchObject({ versionId: "version-2", projectId: project.projectId });
        await expect(api.deleteProjectVersion(project.projectId, "version-2")).resolves.toBeUndefined();
        expect(transport.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
            ["https://canvas.example/api/v1/projects/project%2F1/document", "GET"],
            ["https://canvas.example/api/v1/projects/project%2F1/document", "PUT"],
            ["https://canvas.example/api/v1/projects/project%2F1/versions", "POST"],
            ["https://canvas.example/api/v1/projects/project%2F1/versions/version-2", "DELETE"],
        ]);
        expect(JSON.parse(transport.mock.calls[1][1]?.body as string)).toEqual(document);
        expect(JSON.parse(transport.mock.calls[2][1]?.body as string)).toEqual(versionWrite);
    });

    test("maps project rename and delete commands to empty 204 responses", async () => {
        const transport = vi.fn().mockResolvedValueOnce(response(undefined, 204)).mockResolvedValueOnce(response(undefined, 204));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });
        await api.renameProject(project.projectId, "Renamed");
        await api.deleteProject(project.projectId);
        expect(transport.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
            ["https://canvas.example/api/v1/projects/project%2F1", "PATCH"],
            ["https://canvas.example/api/v1/projects/project%2F1", "DELETE"],
        ]);
        expect(JSON.parse(transport.mock.calls[0][1]?.body as string)).toEqual({ name: "Renamed" });
    });

    test("loads a full version snapshot separately from version summaries", async () => {
        const fullVersion = { ...versionWrite, sourceAssetId: asset.assetId, resultAssetId: asset.assetId, versionId: version.versionId, projectId: project.projectId };
        const transport = vi.fn().mockResolvedValue(response(fullVersion));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport });
        await expect(api.getProjectVersion(project.projectId, version.versionId)).resolves.toEqual(fullVersion);
        expect(transport).toHaveBeenCalledWith("https://canvas.example/api/v1/projects/project%2F1/versions/version-1", expect.objectContaining({ method: "GET" }));
    });

    test.each(["sourceAssetId", "resultAssetId"])("rejects non-null non-string version relationship %s", async (field) => {
        const fullVersion = { ...versionWrite, versionId: version.versionId, projectId: project.projectId, [field]: { id: "invalid" } };
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response(fullVersion)) });
        await expect(api.getProjectVersion(project.projectId, version.versionId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });

    test("rejects a full version snapshot whose ID differs from the requested path", async () => {
        const fullVersion = { ...versionWrite, versionId: "version-2", projectId: project.projectId };
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response(fullVersion)) });
        await expect(api.getProjectVersion(project.projectId, version.versionId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });

    test("maps structured server errors without losing code/details", async () => {
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockImplementation(() => Promise.resolve(response({ code: "PROJECT_NOT_FOUND", message: "项目不存在", details: { projectId: "missing" } }, 404))) });
        await expect(api.getProject("missing")).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND", message: "项目不存在", details: { projectId: "missing" } });
        await expect(api.getProject("missing")).rejects.toBeInstanceOf(CanvasApiError);
    });

    test("resolves authentication headers for each request without owning token refresh", async () => {
        let token = "first";
        const transport = vi.fn().mockImplementation(() => Promise.resolve(response([version])));
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: transport, headers: () => ({ Authorization: `Bearer ${token}` }) });

        await api.listVersions(project.projectId);
        token = "second";
        await api.listVersions(project.projectId);

        expect(new Headers(transport.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer first");
        expect(new Headers(transport.mock.calls[1][1]?.headers).get("authorization")).toBe("Bearer second");
    });

    test("uses stable fallback errors for network, empty, and non-JSON responses", async () => {
        const networkApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockRejectedValue(new Error("offline")) });
        await expect(networkApi.listVersions("project-1")).rejects.toMatchObject({ code: "NETWORK_ERROR", message: "offline" });
        const textApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(new Response("upstream unavailable", { status: 503, statusText: "Service Unavailable" })) });
        await expect(textApi.listVersions("project-1")).rejects.toMatchObject({ code: "HTTP_503", message: "Service Unavailable", details: { response: "upstream unavailable" } });
        const emptyApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response(undefined, 204)) });
        await expect(emptyApi.listVersions("project-1")).rejects.toMatchObject({ code: "HTTP_204" });
        const invalidApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(new Response("not json", { status: 200 })) });
        await expect(invalidApi.listVersions("project-1")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });

    test("validates response envelopes and project ownership before returning DTOs", async () => {
        const invalidProjectApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ projectId: project.projectId, name: "missing timestamps" })) });
        await expect(invalidProjectApi.getProject(project.projectId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

        const wrongAssetApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...asset, projectId: "other-project" }, 201)) });
        await expect(wrongAssetApi.uploadAsset({ projectId: project.projectId, name: asset.name, mimeType: asset.mimeType, url: asset.url, width: asset.width, height: asset.height })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

        const invalidTaskApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...task, status: "PROCESSING" })) });
        await expect(invalidTaskApi.getTask(task.taskId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

        const invalidProjectsApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response([{ ...project, projectId: "" }])) });
        await expect(invalidProjectsApi.listProjects()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });

    test("validates project documents and accepted task responses", async () => {
        const invalidDocumentApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...document, viewport: { x: 0, y: 0 } })) });
        await expect(invalidDocumentApi.getProjectDocument(project.projectId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

        const invalidAcceptedApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ status: 200, taskId: "task-1" }, 202)) });
        await expect(invalidAcceptedApi.submitTask({ projectId: project.projectId, type: "GENERATE", prompt: "room" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });

    test("rejects malformed structured task errors", async () => {
        const invalidCodeApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...task, status: "FAILED", error: { code: "", message: "failed" } })) });
        await expect(invalidCodeApi.getTask(task.taskId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

        const invalidDetailsApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...task, status: "FAILED", error: { code: "FAILED", message: "failed", details: [] } })) });
        await expect(invalidDetailsApi.getTask(task.taskId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

        const validErrorApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...task, status: "FAILED", error: { code: "FAILED", message: "failed", details: { provider: "mock" } } })) });
        await expect(validErrorApi.getTask(task.taskId)).resolves.toMatchObject({ status: "FAILED", error: { code: "FAILED", details: { provider: "mock" } } });
    });

    test("validates task state against error and result identities", async () => {
        const invalidTasks = [
            { ...task, status: "SUCCEEDED", resultAssetId: null, versionId: null },
            { ...task, status: "SUCCEEDED", resultAssetId: asset.assetId, versionId: version.versionId, error: { code: "FAILED", message: "stale error" } },
            { ...task, status: "RUNNING", resultAssetId: asset.assetId, versionId: version.versionId },
            { ...task, status: "FAILED", error: null },
            { ...task, status: "FAILED", error: { code: "FAILED", message: "failed" }, resultAssetId: asset.assetId },
        ];
        for (const invalidTask of invalidTasks) {
            const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response(invalidTask)) });
            await expect(api.getTask(task.taskId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
        }

        const successfulTask = { ...task, status: "SUCCEEDED", resultAssetId: asset.assetId, versionId: version.versionId };
        const successApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response(successfulTask)) });
        await expect(successApi.getTask(task.taskId)).resolves.toEqual(successfulTask);

        const failedTask = { ...task, status: "FAILED", error: { code: "FAILED", message: "failed" } };
        const failedApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response(failedTask)) });
        await expect(failedApi.getTask(task.taskId)).resolves.toEqual(failedTask);
    });

    test("rejects an HTTP task response whose ID differs from the requested path", async () => {
        const api = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response({ ...task, taskId: "task-other" })) });
        await expect(api.getTask(task.taskId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });

    test("preserves task project identity and rejects cross-project version lists", async () => {
        const otherTask = { ...task, projectId: "other-project" };
        const taskApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response(otherTask)) });
        await expect(taskApi.getTask(task.taskId)).resolves.toEqual(otherTask);

        const otherVersion = { ...version, projectId: "other-project" };
        const versionApi = createCanvasHttpAdapter({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response([otherVersion])) });
        await expect(versionApi.listVersions(project.projectId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });
});
