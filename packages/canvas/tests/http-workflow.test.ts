import { describe, expect, it, vi } from "vitest";
import { createCanvasHttpWorkflow } from "../src/services/api/canvas/http-workflow";

describe("Canvas HTTP workflow", () => {
    it("loads assets and versions through the shared API and exposes task polling", async () => {
        const fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/projects/project-1/assets")) return Response.json([]);
            if (url.endsWith("/projects/project-1/versions")) return Response.json([]);
            if (url.endsWith("/tasks/task-1")) return Response.json({
                taskId: "task-1", projectId: "project-1", type: "GENERATE", status: "FAILED",
                sourceAssetId: null, sourceVersionId: null, resultAssetId: null, versionId: null,
                error: { code: "FAILED", message: "failed" }, createdAt: "now", updatedAt: "now",
            });
            throw new Error(`Unexpected request: ${url}`);
        });
        const workflow = createCanvasHttpWorkflow({ baseUrl: "http://canvas.test", fetch });

        await expect(workflow.loadProject("project-1")).resolves.toEqual({ assets: [], versions: [], tasks: [] });
        const snapshot = await workflow.pollTask("task-1", { intervalMs: 0, wait: async () => undefined, projectId: "project-1" });

        expect(snapshot.task.status).toBe("FAILED");
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(workflow.hostAdapters.taskExecution).toBeDefined();
    });

    it("loads host-provided task history without assuming a task route", async () => {
        const fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/projects/project-1/assets")) return Response.json([]);
            if (url.endsWith("/projects/project-1/versions")) return Response.json([]);
            throw new Error(`Unexpected request: ${url}`);
        });
        const listTasks = vi.fn(async (projectId: string, signal?: AbortSignal) => {
            signal?.throwIfAborted();
            expect(projectId).toBe("project-1");
            return [{
                taskId: "task-1", projectId, type: "GENERATE" as const, status: "RUNNING" as const,
                sourceAssetId: null, sourceVersionId: null, resultAssetId: null, versionId: null,
                error: null, createdAt: "now", updatedAt: "now",
            }];
        });
        const workflow = createCanvasHttpWorkflow({ baseUrl: "http://canvas.test", fetch, listTasks });

        await expect(workflow.loadProject("project-1")).resolves.toMatchObject({ tasks: [{ taskId: "task-1", status: "RUNNING" }] });
        expect(listTasks).toHaveBeenCalledOnce();
    });
});
