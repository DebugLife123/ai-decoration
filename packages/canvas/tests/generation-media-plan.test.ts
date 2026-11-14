import { describe, expect, test } from "vitest";
import { applyCanvasGeneratedMediaPlan, createCanvasGeneratedMediaPlan } from "../src/features/canvas/generation-media-plan";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const source = (type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id: "source", type, title: "Source", position: { x: 10, y: 20 }, width: 400, height: 240, metadata,
});

describe("Canvas generated media plan", () => {
    test("places new video to the right and carries task settings as loading metadata", () => {
        const parent = source(CanvasNodeType.Config);
        const plan = createCanvasGeneratedMediaPlan({ nodeId: parent.id, sourceNode: parent, type: CanvasNodeType.Video, prompt: "Living room", size: { width: 420, height: 236 }, metadata: { model: "video-model", seconds: "6", references: ["asset://ref"] }, createId: () => "video-id" });
        expect(plan).toMatchObject({ nodeId: "video-id", reusesSource: false, node: { type: CanvasNodeType.Video, title: "Living room", position: { x: 506, y: 20 }, width: 420, height: 236, metadata: { status: "loading", model: "video-model", references: ["asset://ref"], prompt: "Living room" } } });
        expect(applyCanvasGeneratedMediaPlan([parent], plan)).toMatchObject([{ id: "source", metadata: { status: "success" } }, { id: "video-id" }]);
    });

    test("reuses empty audio/video nodes and vertically centers newly created audio", () => {
        const emptyAudio = source(CanvasNodeType.Audio);
        const audioPlan = createCanvasGeneratedMediaPlan({ nodeId: emptyAudio.id, sourceNode: emptyAudio, type: CanvasNodeType.Audio, prompt: "Voice", size: { width: 340, height: 120 }, metadata: { audioFormat: "wav" }, createId: () => "unused" });
        expect(audioPlan).toMatchObject({ nodeId: "source", reusesSource: true, node: { position: { x: 10, y: 20 }, width: 400, height: 240, metadata: { status: "loading", audioFormat: "wav" } } });

        const otherSource = source(CanvasNodeType.Text);
        const newAudio = createCanvasGeneratedMediaPlan({ nodeId: otherSource.id, sourceNode: otherSource, type: CanvasNodeType.Audio, prompt: "Voice", size: { width: 340, height: 120 }, metadata: {}, createId: () => "audio-id" });
        expect(newAudio.node.position).toEqual({ x: 506, y: 80 });
        const emptyVideo = source(CanvasNodeType.Video);
        expect(createCanvasGeneratedMediaPlan({ nodeId: emptyVideo.id, sourceNode: emptyVideo, type: CanvasNodeType.Video, prompt: "Clip", size: { width: 320, height: 180 }, metadata: {}, createId: () => "unused" }).reusesSource).toBe(true);
    });
});
