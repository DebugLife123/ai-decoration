import { expect, test, vi } from "vitest";
import { createCanvasHttpImageGeneration } from "../src/features/canvas/http-image-generation";
import type { CanvasImageRequest } from "../src/features/canvas/image-generation";

const request: CanvasImageRequest = {
    projectId: "project",
    operation: "edit",
    prompt: "把门换成黑色",
    settings: { model: "gateway", quality: "auto", size: "auto", background: "auto" },
    references: [
        { id: "source", name: "原图", type: "image/png", dataUrl: "data:image/png;base64,source" },
        { id: "mask", name: "mask.png", type: "image/png", dataUrl: "data:image/png;base64,mask" },
    ],
};

test("sends the host-compatible edit body and returns an immediate image", async () => {
    const requestFetch = vi.fn().mockResolvedValue(Response.json({ imageUrl: "data:image/png;base64,result" }));
    const result = await createCanvasHttpImageGeneration({ fetch: requestFetch }).execute(request, new AbortController().signal);
    expect(result).toEqual({ dataUrl: "data:image/png;base64,result" });
    expect(requestFetch).toHaveBeenCalledWith("/api/ai/edit-room-image", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }));
    expect(JSON.parse(requestFetch.mock.calls[0][1].body)).toMatchObject({ image: request.references[0].dataUrl, mask: request.references[1].dataUrl, instruction: request.prompt });
});

test("delegates job results to the host poller without choosing timing policy", async () => {
    const requestFetch = vi.fn().mockResolvedValue(Response.json({ jobId: "job-1" }, { status: 202 }));
    const pollJob = vi.fn().mockResolvedValue("data:image/png;base64,polled");
    await expect(createCanvasHttpImageGeneration({ fetch: requestFetch, pollJob }).execute({ ...request, operation: "generate", references: [request.references[0]] }, new AbortController().signal)).resolves.toEqual({ dataUrl: "data:image/png;base64,polled" });
    expect(pollJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ operation: "generate" }), expect.any(AbortSignal));
});

test("rejects a queued response when the host did not configure a poller", async () => {
    const requestFetch = vi.fn().mockResolvedValue(Response.json({ jobId: "job-1" }, { status: 202 }));
    await expect(createCanvasHttpImageGeneration({ fetch: requestFetch }).execute(request, new AbortController().signal)).rejects.toThrow("宿主未配置任务查询器");
});
