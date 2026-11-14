import { describe, expect, test, vi } from "vitest";
import { createCanvasRetryPlan } from "../src/features/canvas/retry-plan";
import { prepareCanvasRetry, readCanvasRetryReferences } from "../src/features/canvas/retry-preparation";
import { defaultCanvasGenerationPreferences } from "../src/features/canvas/generation-preferences";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

const node = (id: string, type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata,
});

const media = (readImage = vi.fn(async (_projectId: string, image: { dataUrl: string }) => image.dataUrl)): CanvasMediaAdapter => ({
    restore: vi.fn(async (_projectId, snapshot) => snapshot),
    readImage,
    readMedia: vi.fn(),
    cleanup: vi.fn(),
});

describe("Canvas retry preparation", () => {
    test("preserves a missing saved reference for the editor to report after prompt validation", async () => {
        const target = node("target", CanvasNodeType.Image, { generationType: "edit", prompt: "retry" });
        const plan = createCanvasRetryPlan({ node: target, nodes: [target], connections: [], preferences: defaultCanvasGenerationPreferences });
        await expect(prepareCanvasRetry({ plan, nodes: [target], connections: [], media: media(), projectId: "project", signal: new AbortController().signal })).resolves.toMatchObject({ prompt: "retry", useReferenceImages: true, savedReferences: null });
    });

    test("loads saved edit references through the host media adapter", async () => {
        const target = node("target", CanvasNodeType.Image, { generationType: "edit", prompt: "retry", references: ["asset://reference"] });
        const readImage = vi.fn(async () => "data:image/png;base64,loaded");
        const plan = createCanvasRetryPlan({ node: target, nodes: [target], connections: [], preferences: defaultCanvasGenerationPreferences });
        const adapter = media(readImage);
        const signal = new AbortController().signal;
        const preparation = await prepareCanvasRetry({ plan, nodes: [target], connections: [], media: adapter, projectId: "project", signal });
        const referenceImages = await readCanvasRetryReferences({ plan, preparation, media: adapter, projectId: "project", signal });
        expect(readImage).toHaveBeenCalledWith("project", expect.objectContaining({ dataUrl: "asset://reference" }), expect.any(AbortSignal));
        expect({ ...preparation, referenceImages }).toMatchObject({ prompt: "retry", useReferenceImages: true, referenceImages: [{ dataUrl: "data:image/png;base64,loaded" }] });
    });

    test("hydrates connected context when no saved image generation identity exists", async () => {
        const reference = node("reference", CanvasNodeType.Image, { content: "asset://reference" });
        const config = node("config", CanvasNodeType.Config, { prompt: "config prompt" });
        const target = node("target", CanvasNodeType.Image);
        const nodes = [reference, config, target];
        const connections: CanvasConnection[] = [
            { id: "reference-config", fromNodeId: reference.id, toNodeId: config.id },
            { id: "config-target", fromNodeId: config.id, toNodeId: target.id },
        ];
        const plan = createCanvasRetryPlan({ node: target, nodes, connections, preferences: defaultCanvasGenerationPreferences });
        const adapter = media();
        const signal = new AbortController().signal;
        const preparation = await prepareCanvasRetry({ plan, nodes, connections, media: adapter, projectId: "project", signal });
        const referenceImages = await readCanvasRetryReferences({ plan, preparation, media: adapter, projectId: "project", signal });
        expect({ ...preparation, referenceImages }).toMatchObject({ prompt: "config prompt", useReferenceImages: true, referenceImages: [{ id: reference.id, dataUrl: "asset://reference" }] });
    });
});
