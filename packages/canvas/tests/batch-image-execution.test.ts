import { beforeEach, describe, expect, test, vi } from "vitest";
import { executeCanvasBatchImageAttempt } from "../src/features/canvas/batch-image-execution";
import type { CanvasGenerationConfig } from "../src/features/canvas/generation-preferences";

const uploaded = {
    assetId: "asset-1",
    projectId: "project-1",
    name: "result.png",
    kind: "IMAGE" as const,
    mimeType: "image/png",
    url: "asset:asset-1",
    width: 640,
    height: 480,
    bytes: 1024,
    createdAt: "fixture",
};

const input = {
    projectId: "project-1",
    generation: { execute: vi.fn().mockResolvedValue({ dataUrl: "data:image/png;base64,AA==" }) },
    saveResultImage: vi.fn().mockResolvedValue(uploaded),
    imageId: "image-1",
    prompt: "living room",
    settings: { model: "model-1", quality: "high", size: "1:1", background: "auto" } as CanvasGenerationConfig,
    references: [],
    signal: new AbortController().signal,
    isCanceled: (error: unknown) => error instanceof DOMException && error.name === "AbortError",
    fallbackMessage: "generation failed",
};

describe("batch image execution", () => {
    beforeEach(() => vi.clearAllMocks());

    test("returns a saved image without writing editor state", async () => {
        const result = await executeCanvasBatchImageAttempt(input);
        expect(result).toEqual({
            status: "succeeded",
            image: {
                id: "image-1", assetId: "asset-1", status: "success", content: "asset:asset-1",
                storageKey: undefined, naturalWidth: 640, naturalHeight: 480, bytes: 1024, mimeType: "image/png",
            },
        });
        expect(input.generation.execute).toHaveBeenCalledWith(expect.objectContaining({ operation: "generate" }), expect.any(AbortSignal));
        expect(input.saveResultImage).toHaveBeenCalledWith("data:image/png;base64,AA==", "canvas-image-1.png", input.signal);
    });

    test("maps provider and upload failures without losing the fallback", async () => {
        const failed = await executeCanvasBatchImageAttempt({ ...input, generation: { execute: vi.fn().mockRejectedValue(new Error("provider down")) } });
        expect(failed).toEqual({ status: "failed", errorDetails: "provider down" });
        const uploadFailed = await executeCanvasBatchImageAttempt({ ...input, saveResultImage: vi.fn().mockRejectedValue(new Error("upload down")) });
        expect(uploadFailed).toEqual({ status: "failed", errorDetails: "upload down" });
        const fallback = await executeCanvasBatchImageAttempt({ ...input, generation: { execute: vi.fn().mockRejectedValue("unknown") } });
        expect(fallback).toEqual({ status: "failed", errorDetails: "generation failed" });
        expect(input.saveResultImage).not.toHaveBeenCalled();
    });

    test("reports canceled attempts separately from failures", async () => {
        const error = new DOMException("aborted", "AbortError");
        const canceled = await executeCanvasBatchImageAttempt({
            ...input,
            generation: { execute: vi.fn().mockRejectedValue(error) },
            isCanceled: (value) => value === error,
        });
        expect(canceled).toEqual({ status: "canceled" });
        expect(input.saveResultImage).not.toHaveBeenCalled();
    });
});
