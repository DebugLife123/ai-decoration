import { describe, expect, test } from "vitest";
import { canvasModelName, canvasModelScript, decodeCanvasModel, encodeCanvasModel, resolveCanvasModelEntry } from "../src/features/canvas/model-resolution";

const channels = [
    { id: "room", name: "Room provider", apiKey: "secret", baseUrl: "https://private.invalid", models: [{ name: "image-model", capability: "image", script: "  return image  ", apiKey: "nested secret" }] },
    { id: "video", name: "Video provider", apiKey: "other-secret", baseUrl: "https://other.invalid", models: [{ name: "video-model", capability: "video" }] },
];

describe("canvas model reference resolution", () => {
    test("encodes a channel and resolves the same model without copying provider credentials", () => {
        const value = encodeCanvasModel("room", " image-model ");
        const result = resolveCanvasModelEntry(channels, value);

        expect(value).toBe("room::image-model");
        expect(decodeCanvasModel(value)).toEqual({ channelId: "room", model: "image-model" });
        expect(canvasModelName(value)).toBe("image-model");
        expect(result).toEqual({ channelId: "room", entry: { name: "image-model", script: "  return image  " } });
        expect(JSON.stringify(result)).not.toContain("secret");
        expect(JSON.stringify(result)).not.toContain("private.invalid");
    });

    test("resolves legacy bare model names and trims script metadata", () => {
        expect(resolveCanvasModelEntry(channels, "video-model")?.channelId).toBe("video");
        expect(canvasModelScript(channels, "room::image-model")).toBe("return image");
        expect(canvasModelScript(channels, "missing-model")).toBe("");
    });

    test("does not fall back to another channel for an unknown qualified model", () => {
        expect(resolveCanvasModelEntry(channels, "missing::image-model")).toBeNull();
    });
});
