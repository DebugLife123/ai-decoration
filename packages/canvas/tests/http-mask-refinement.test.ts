import { describe, expect, it, vi } from "vitest";
import { createCanvasHttpMaskRefinement } from "../src/features/canvas/http-mask-refinement";

describe("createCanvasHttpMaskRefinement", () => {
    it("sends mask-only inputs and returns the refined mask without image generation", async () => {
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ maskDataUrl: "data:image/png;base64,cmVmaW5lZA==", bounds: { x: 1, y: 2, width: 3, height: 4 } }), { status: 200 }));
        const controller = new AbortController();
        const service = createCanvasHttpMaskRefinement({ fetch });

        const result = await service.execute({
            projectId: "project-1",
            imageDataUrl: "data:image/png;base64,aW1hZ2U=",
            maskDataUrl: "data:image/png;base64,bWFzaw==",
            positiveMaskDataUrl: "data:image/png;base64,cG9zaXRpdmU=",
            negativeMaskDataUrl: "data:image/png;base64,bmVnYXRpdmU=",
        }, controller.signal);

        const [, init] = fetch.mock.calls[0];
        expect(JSON.parse(String(init?.body))).toMatchObject({
            projectId: "project-1",
            image: "data:image/png;base64,aW1hZ2U=",
            mask: "data:image/png;base64,bWFzaw==",
            positiveMask: "data:image/png;base64,cG9zaXRpdmU=",
            negativeMask: "data:image/png;base64,bmVnYXRpdmU=",
            output: "mask",
        });
        expect(result).toEqual({ maskDataUrl: "data:image/png;base64,cmVmaW5lZA==", bounds: { x: 1, y: 2, width: 3, height: 4 } });
    });

    it("rejects responses that do not contain a mask", async () => {
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ dataUrl: "image-result" }), { status: 200 }));
        const service = createCanvasHttpMaskRefinement({ fetch });
        await expect(service.execute({
            projectId: "project-1",
            imageDataUrl: "image",
            maskDataUrl: "mask",
            positiveMaskDataUrl: "positive",
            negativeMaskDataUrl: "negative",
        }, new AbortController().signal)).rejects.toThrow("未返回 mask");
    });
});
