import { describe, expect, test } from "vitest";

import { isCanvasAssetReferencedByAssistantSessions, isCanvasAssetReferencedByNodes } from "../src/features/canvas/asset-metadata";
import type { CanvasAssistantSession, CanvasNodeData } from "../src/types/canvas";

describe("canvas asset references", () => {
    test("finds top-level and batch image asset identities", () => {
        const nodes = [{
            id: "batch", type: "image", title: "批量结果", position: { x: 0, y: 0 }, width: 100, height: 100,
            metadata: { assetId: "primary", images: [{ id: "item", assetId: "batch-item", status: "success", content: "data:image/png;base64,eA==", naturalWidth: 1, naturalHeight: 1, bytes: 1, mimeType: "image/png" }] },
        }] as CanvasNodeData[];

        expect(isCanvasAssetReferencedByNodes(nodes, "primary")).toBe(true);
        expect(isCanvasAssetReferencedByNodes(nodes, "batch-item")).toBe(true);
        expect(isCanvasAssetReferencedByNodes(nodes, "missing")).toBe(false);
    });

    test("finds assistant reference asset identities", () => {
        const sessions = [{ id: "chat", title: "会话", createdAt: "fixture", updatedAt: "fixture", messages: [{ id: "message", role: "user", text: "参考", references: [{ id: "reference", assetId: "assistant-asset", type: "image", title: "参考图" }] }] }] as CanvasAssistantSession[];

        expect(isCanvasAssetReferencedByAssistantSessions(sessions, "assistant-asset")).toBe(true);
        expect(isCanvasAssetReferencedByAssistantSessions(sessions, "missing")).toBe(false);
    });
});
