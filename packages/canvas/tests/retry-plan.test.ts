import { describe, expect, test } from "vitest";
import { createCanvasRetryPlan, resolveCanvasRetryInputs } from "../src/features/canvas/retry-plan";
import { defaultCanvasGenerationPreferences } from "../src/features/canvas/generation-preferences";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

const preferences = {
    ...defaultCanvasGenerationPreferences,
    model: "image-current",
    imageModel: "image-current",
    videoModel: "video-current",
    textModel: "text-current",
    audioModel: "audio-current",
    modelCapabilities: {
        "image-current": "image" as const,
        "video-current": "video" as const,
        "text-current": "text" as const,
        "audio-current": "audio" as const,
    },
};

const node = (id: string, type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata,
});

describe("Canvas retry plan", () => {
    test("uses the nearest config source and saved image generation settings", () => {
        const config = node("config", CanvasNodeType.Config, { prompt: "config prompt" });
        const image = node("image", CanvasNodeType.Image, {
            generationType: "edit",
            prompt: "saved prompt",
            model: "saved-image-model",
            size: "16:9",
            quality: "high",
            background: "transparent",
            references: ["asset://reference"],
        });
        const connections: CanvasConnection[] = [{ id: "connection", fromNodeId: config.id, toNodeId: image.id }];
        const plan = createCanvasRetryPlan({ node: image, nodes: [config, image], connections, preferences });

        expect(plan).toMatchObject({ sourceNode: { id: config.id }, usesSavedImageMetadata: true, contextPrompt: "config prompt" });
        expect(plan.generationConfig).toMatchObject({ model: "saved-image-model", size: "16:9", quality: "high", background: "transparent", count: "1" });
        expect(resolveCanvasRetryInputs(plan, { prompt: "hydrated prompt", referenceImages: [] })).toMatchObject({
            prompt: "saved prompt",
            useReferenceImages: true,
            savedReferences: [{ dataUrl: "asset://reference" }],
        });
    });

    test("reports missing saved references for an edit retry", () => {
        const image = node("image", CanvasNodeType.Image, { generationType: "edit", prompt: "saved prompt" });
        const plan = createCanvasRetryPlan({ node: image, nodes: [image], connections: [], preferences });
        expect(resolveCanvasRetryInputs(plan, null)).toEqual({ prompt: "saved prompt", useReferenceImages: true, savedReferences: null });
    });

    test("uses hydrated prompt and references when the node has no saved image identity", () => {
        const image = node("image", CanvasNodeType.Image, { prompt: "node prompt" });
        const plan = createCanvasRetryPlan({ node: image, nodes: [image], connections: [], preferences });
        const reference = { id: "reference", name: "reference.png", type: "image/png", dataUrl: "asset://reference" };
        expect(resolveCanvasRetryInputs(plan, { prompt: " hydrated prompt ", referenceImages: [reference] })).toEqual({
            prompt: "hydrated prompt",
            useReferenceImages: true,
            savedReferences: [],
        });
    });

    test.each(
        [
            [CanvasNodeType.Image, "image-current"],
            [CanvasNodeType.Text, "text-current"],
            [CanvasNodeType.Video, "video-current"],
            [CanvasNodeType.Audio, "audio-current"],
        ] satisfies Array<[CanvasNodeData["type"], string]>,
    )("builds the %s retry config from the matching preference", (type, expectedModel) => {
        const target = node("target", type, { prompt: "prompt" });
        const plan = createCanvasRetryPlan({ node: target, nodes: [target], connections: [], preferences });
        expect(plan.sourceNode).toBe(target);
        expect(plan.generationConfig).toMatchObject({ model: expectedModel, count: "1" });
    });
});
