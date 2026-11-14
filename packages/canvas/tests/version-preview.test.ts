import { describe, expect, test, vi } from "vitest";
const mediaMocks = vi.hoisted(() => ({ restoreCanvasMedia: vi.fn() }));
vi.mock("../src/features/canvas/media", () => mediaMocks);
import { loadCanvasVersionPreview } from "../src/features/canvas/version-preview";
import type { CanvasVersionDocument } from "../src/features/canvas/contracts";
import type { CanvasMediaAdapter, CanvasMediaSnapshot } from "../src/features/canvas/media";

const nodes = [{ id: "source-node" }] as CanvasVersionDocument["nodes"];
const media = {} as CanvasMediaAdapter;

describe("Canvas version preview loading", () => {
    test("loads media for the selected project without mutating the saved version", async () => {
        const restoredNodes = [{ id: "preview-node" }] as CanvasVersionDocument["nodes"];
        mediaMocks.restoreCanvasMedia.mockResolvedValueOnce({ nodes: restoredNodes, chatSessions: [] });
        const controller = new AbortController();

        await expect(loadCanvasVersionPreview(media, "project-a", { nodes }, controller.signal)).resolves.toBe(restoredNodes);

        expect(mediaMocks.restoreCanvasMedia).toHaveBeenCalledWith(media, "project-a", { nodes, chatSessions: [] }, controller.signal);
        expect(nodes).toEqual([{ id: "source-node" }]);
    });

    test("rejects a late media result after the selection is canceled", async () => {
        let resolveRestore!: (snapshot: CanvasMediaSnapshot) => void;
        mediaMocks.restoreCanvasMedia.mockImplementationOnce(() => new Promise((resolve) => { resolveRestore = resolve; }));
        const controller = new AbortController();
        const pending = loadCanvasVersionPreview(media, "project-a", { nodes }, controller.signal);
        controller.abort();
        resolveRestore({ nodes, chatSessions: [] });

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    });

    test("propagates media errors to the preview owner", async () => {
        mediaMocks.restoreCanvasMedia.mockRejectedValueOnce(new Error("media unavailable"));

        await expect(loadCanvasVersionPreview(media, "project-a", { nodes }, new AbortController().signal)).rejects.toThrow("media unavailable");
    });
});
