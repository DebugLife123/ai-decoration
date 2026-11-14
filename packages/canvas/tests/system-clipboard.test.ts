import { describe, expect, test, vi } from "vitest";
import { pasteCanvasSystemClipboard } from "../src/features/canvas/system-clipboard";

describe("Canvas system clipboard", () => {
    test("prefers an image item and creates a file for the host", async () => {
        const createImageFile = vi.fn(async () => undefined);
        const createTextNode = vi.fn(() => true);
        const clipboard = {
            read: async () => [{ types: ["text/plain", "image/png"], getType: async () => new Blob(["png"], { type: "image/png" }) }],
            readText: async () => "ignored",
        };

        await expect(pasteCanvasSystemClipboard(clipboard, { createImageFile, createTextNode })).resolves.toBe("image");
        expect(createImageFile).toHaveBeenCalledWith(expect.objectContaining({ name: "clipboard-image.png", type: "image/png" }));
        expect(createTextNode).not.toHaveBeenCalled();
    });

    test("falls back to text when no image is available", async () => {
        const createTextNode = vi.fn(() => true);
        const result = await pasteCanvasSystemClipboard({ read: async () => [], readText: async () => "  hello  " }, { createImageFile: vi.fn(), createTextNode });

        expect(result).toBe("text");
        expect(createTextNode).toHaveBeenCalledWith("  hello  ");
    });

    test("returns null when the clipboard is unavailable or rejected by the host", async () => {
        await expect(pasteCanvasSystemClipboard(undefined, { createImageFile: vi.fn(), createTextNode: vi.fn(() => false) })).resolves.toBeNull();
        await expect(pasteCanvasSystemClipboard({ readText: async () => "" }, { createImageFile: vi.fn(), createTextNode: vi.fn(() => false) })).resolves.toBeNull();
    });
});
