import { describe, expect, test, vi } from "vitest";
vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
import { createCanvasHttpHostAdapters } from "../src/services/api/canvas/http-host-adapters";

const response = (body: unknown, status = 200) => new Response(body === undefined ? undefined : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const project = { projectId: "project-1", name: "Living room", createdAt: "created", updatedAt: "updated" };
const ticket = { uploadId: "upload-1", projectId: project.projectId, method: "PUT" as const, uploadUrl: "https://storage.example/object", headers: { "Content-Type": "image/png", "x-signed": "yes" } };
const asset = { assetId: "asset-1", projectId: project.projectId, name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", url: "data:image/png;base64,room", width: 10, height: 10, createdAt: "created" };
const version = { versionId: "version-1", projectId: project.projectId, sourceAssetId: null, resultAssetId: asset.assetId, createdAt: "created", name: "Mock result" };
const succeededTask = { taskId: "task-1", projectId: project.projectId, type: "GENERATE" as const, status: "SUCCEEDED" as const, sourceAssetId: null, sourceVersionId: null, resultAssetId: asset.assetId, versionId: version.versionId, error: null, createdAt: "created", updatedAt: "updated" };

describe("Canvas HTTP host adapters", () => {
    test("assembles API, host boundaries, and ticket uploader from one transport", async () => {
        const transport = vi.fn()
            .mockResolvedValueOnce(response(ticket, 201))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const host = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: transport, headers: { Authorization: "Bearer test" } });
        expect(host.tasks?.submitTask).toBe(host.api?.submitTask);
        expect(host.results?.listVersions).toBe(host.api?.listVersions);
        expect(host.taskExecution).toMatchObject({ submit: expect.any(Function), query: expect.any(Function), update: expect.any(Function), poll: expect.any(Function) });
        expect(host.assets?.listAssets).toBe(host.api?.listAssets);
        await expect(host.uploads.createUploadTicket({ projectId: project.projectId, name: "room.png", mimeType: "image/png", bytes: 3 })).resolves.toEqual(ticket);
        const file = new File([new Uint8Array([1, 2, 3])], "room.png", { type: "image/png" });
        await expect(host.uploads.uploadBinary(ticket, file)).resolves.toBeUndefined();
        expect(transport).toHaveBeenNthCalledWith(2, ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
        expect(new Headers(transport.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer test");
    });

    test("runs successful task result assembly through the HTTP bundle", async () => {
        const transport = vi.fn()
            .mockResolvedValueOnce(response(succeededTask))
            .mockResolvedValueOnce(response([asset]))
            .mockResolvedValueOnce(response([version]));
        const host = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: transport });

        await expect(host.taskExecution!.query(succeededTask.taskId)).resolves.toEqual({ task: succeededTask, assets: [asset], versions: [version], resultAsset: asset });
        expect(transport.mock.calls.map(([url]) => url)).toEqual([
            "https://canvas.example/api/v1/tasks/task-1",
            "https://canvas.example/api/v1/projects/project-1/assets",
            "https://canvas.example/api/v1/projects/project-1/versions",
        ]);
    });

    test("rejects a successful HTTP task when its result asset belongs to another project", async () => {
        const transport = vi.fn()
            .mockResolvedValueOnce(response(succeededTask))
            .mockResolvedValueOnce(response([{ ...asset, projectId: "project-2" }]))
            .mockResolvedValueOnce(response([]));
        const host = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: transport });

        await expect(host.taskExecution!.query(succeededTask.taskId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
        expect(transport).toHaveBeenCalledTimes(3);
    });

    test("preserves the structured task error through the HTTP host bundle", async () => {
        const error = { code: "MODEL_NOT_CONFIGURED", message: "请先配置模型", details: { capability: "IMAGE" } };
        const host = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: vi.fn().mockResolvedValue(response(error, 422)) });

        await expect(host.tasks!.submitTask({ projectId: project.projectId, type: "GENERATE", prompt: "room" }))
            .rejects.toMatchObject({ name: "CanvasApiError", code: error.code, message: error.message, details: error.details });
    });

    test("keeps task query cancellation distinct from an HTTP/network error", async () => {
        const controller = new AbortController();
        const transport = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
            controller.abort();
            init?.signal?.throwIfAborted();
            return response(succeededTask);
        });
        const host = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: transport });

        await expect(host.taskExecution!.query(succeededTask.taskId, controller.signal))
            .rejects.toMatchObject({ name: "AbortError" });
        expect(transport).toHaveBeenCalledTimes(1);
    });

    test("preserves structured version and asset errors through their host boundaries", async () => {
        const error = { code: "PROJECT_ACCESS_DENIED", message: "无权读取项目", details: { projectId: project.projectId } };
        const host = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: vi.fn().mockImplementation(() => Promise.resolve(response(error, 403))) });

        await expect(host.versions.loadVersions(project.projectId)).rejects.toMatchObject({ name: "CanvasApiError", code: error.code, message: error.message, details: error.details });
        await expect(host.assets!.listAssets(project.projectId)).rejects.toMatchObject({ name: "CanvasApiError", code: error.code, message: error.message, details: error.details });
        expect(host.versions.getSnapshot(project.projectId)).toEqual({ versions: [], currentVersionId: null });
    });

    test("preserves version and asset read cancellation through the host bundle", async () => {
        const controller = new AbortController();
        const transport = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
            controller.abort();
            init?.signal?.throwIfAborted();
            return response([]);
        });
        const host = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: transport });

        await expect(host.versions.loadVersions(project.projectId, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        const assetController = new AbortController();
        const assetTransport = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
            assetController.abort();
            init?.signal?.throwIfAborted();
            return response([]);
        });
        const assetHost = createCanvasHttpHostAdapters({ baseUrl: "https://canvas.example", fetch: assetTransport });
        await expect(assetHost.assets!.listAssets(project.projectId, assetController.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(host.versions.getSnapshot(project.projectId)).toEqual({ versions: [], currentVersionId: null });
    });
});
