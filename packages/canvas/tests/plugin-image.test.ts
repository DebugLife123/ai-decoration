import { beforeEach, expect, test, vi } from "vitest";
import { generateCanvasPluginImage } from "../src/services/api/canvas/plugin-image";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";
import type { CanvasGenerationPreferences } from "../src/features/canvas/generation-preferences";
import type { ReferenceImage } from "../src/types/image";
import type { CanvasPluginImageGeneration } from "../src/features/canvas/image-generation";

vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

const config = { model: "fixture", count: "2", size: "auto", quality: "auto" } as CanvasGenerationPreferences;
const references: ReferenceImage[] = [
    { id: "source", name: "room.png", type: "image/png", dataUrl: "data:image/png;base64,source", storageKey: "image:source" },
    { id: "second", name: "detail.png", type: "image/png", dataUrl: "data:image/png;base64,detail" },
];
const execute = vi.fn<CanvasPluginImageGeneration["execute"]>();
const generation: CanvasPluginImageGeneration = { execute };
const readImage = vi.fn<CanvasMediaAdapter["readImage"]>();
const media: CanvasMediaAdapter = {
    readImage,
    readMedia: vi.fn(),
    restore: async (_projectId, snapshot) => snapshot,
    cleanup() {},
};
const run = (input = references, signal = new AbortController().signal) => generateCanvasPluginImage(media, "project-1", config, "bright room", input, signal, generation);

beforeEach(() => {
    execute.mockReset().mockResolvedValue({ dataUrls: ["https://provider.example/result.png"] });
    readImage.mockReset().mockResolvedValue("data:image/png;base64,result");
});

test("forwards ordered references and plugin settings through the host generation port", async () => {
    const original = structuredClone(references);
    const signal = new AbortController().signal;

    await expect(run(references, signal)).resolves.toEqual({ images: ["data:image/png;base64,result"] });

    expect(execute).toHaveBeenCalledExactlyOnceWith({
        projectId: "project-1",
        operation: "edit",
        prompt: "bright room",
        settings: { model: "fixture", quality: "auto", size: "auto", background: undefined, count: 2 },
        references: references.map(({ id, name, type, dataUrl }) => ({ id, name, type, dataUrl })),
    }, signal);
    expect(readImage).toHaveBeenCalledWith("project-1", { id: "plugin-result-0", dataUrl: "https://provider.example/result.png", name: "plugin-result-0", type: "" }, signal);
    expect(references).toEqual(original);
});

test("keeps no-reference generation explicit and preserves the requested result count", async () => {
    await generateCanvasPluginImage(media, "project-1", config, "bright room", [], new AbortController().signal, generation);
    expect(execute.mock.calls[0][0]).toMatchObject({ operation: "generate", references: [], settings: { count: 2 } });
});

test("propagates host failures without reading results or retrying", async () => {
    const failure = new Error("host provider failed");
    execute.mockRejectedValue(failure);

    await expect(run()).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledOnce();
    expect(readImage).not.toHaveBeenCalled();
});

test("cancellation prevents host calls and discards late host results", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run(references, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(execute).not.toHaveBeenCalled();

    const lateController = new AbortController();
    execute.mockImplementationOnce(async () => {
        lateController.abort();
        return { dataUrls: ["https://provider.example/late.png"] };
    });
    await expect(run(references, lateController.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(readImage).not.toHaveBeenCalled();
});

test("uses the original result URL when host media reading fails", async () => {
    readImage.mockRejectedValue(new Error("media unavailable"));

    await expect(run()).resolves.toEqual({ images: ["https://provider.example/result.png"] });
});
