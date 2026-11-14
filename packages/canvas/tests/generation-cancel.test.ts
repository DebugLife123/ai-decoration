import { describe, expect, test } from "vitest";
import { applyCanvasGenerationCancellation } from "../src/features/canvas/generation-cancel";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node = (id: string, status: "loading" | "success" = "loading"): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata: {
        status,
        images: [{ id: "image", status: "loading", content: "", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" }],
        texts: [{ id: "text", status: "loading", content: "" }],
    },
});

describe("Canvas generation cancellation transform", () => {
    test("marks loading node and child slots canceled without touching unrelated nodes", () => {
        const loading = node("loading");
        const other = node("other", "success");
        const [updated, unchanged] = applyCanvasGenerationCancellation([loading, other], new Set(["loading"]), "已取消");
        expect(updated).toMatchObject({ metadata: { status: "idle", errorDetails: undefined, images: [{ status: "error", errorDetails: "已取消" }], texts: [{ status: "error", errorDetails: "已取消" }] } });
        expect(unchanged).toBe(other);
    });

    test("ignores affected nodes that are no longer loading", () => {
        const completed = node("done", "success");
        expect(applyCanvasGenerationCancellation([completed], new Set(["done"]), "已取消")[0]).toBe(completed);
    });
});
