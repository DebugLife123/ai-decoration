import { describe, expect, test } from "vitest";
import { createCanvasImportPlan, filterCanvasImportFiles, getCanvasFileKind, getCanvasImportPositions, matchesCanvasFileKind } from "../src/features/canvas/file-import-policy";

describe("Canvas file import policy", () => {
    test("classifies supported images, videos, and audio extensions", () => {
        expect(getCanvasFileKind(new File([], "room.png", { type: "image/png" }))).toBe("image");
        expect(getCanvasFileKind(new File([], "clip.mp4", { type: "video/mp4" }))).toBe("video");
        expect(getCanvasFileKind(new File([], "voice.wav"))).toBe("audio");
        expect(getCanvasFileKind(new File([], "notes.txt", { type: "text/plain" }))).toBeNull();
    });

    test("keeps only importable files in the original order", () => {
        const files = [
            new File([], "notes.txt", { type: "text/plain" }),
            new File([], "room.png", { type: "image/png" }),
            new File([], "clip.mp4", { type: "video/mp4" }),
        ];

        expect(filterCanvasImportFiles(files)).toEqual(files.slice(1));
    });

    test("guards replacement files against the target node kind", () => {
        const image = new File([], "room.png", { type: "image/png" });
        const video = new File([], "clip.mp4", { type: "video/mp4" });
        expect(matchesCanvasFileKind(image, "image")).toBe(true);
        expect(matchesCanvasFileKind(image, "video")).toBe(false);
        expect(matchesCanvasFileKind(video, "video")).toBe(true);
    });

    test("uses a grid offset so batch imports do not stack", () => {
        expect(getCanvasImportPositions({ x: 100, y: 200 }, 3)).toEqual([
            { x: 100, y: 200 },
            { x: 660, y: 200 },
            { x: 1220, y: 200 },
        ]);
        expect(getCanvasImportPositions({ x: 100, y: 200 }, 2, 1)).toEqual([
            { x: 660, y: 200 },
            { x: 1220, y: 200 },
        ]);
    });

    test("plans replacement plus remaining files without side effects", () => {
        const first = new File([], "replacement.png", { type: "image/png" });
        const second = new File([], "nearby.png", { type: "image/png" });
        expect(createCanvasImportPlan([first, second], { x: 100, y: 200 }, "target")).toEqual({
            replacement: { nodeId: "target", file: first },
            items: [{ file: second, position: { x: 660, y: 200 } }],
        });
    });

    test("plans all files around the base position and handles empty input", () => {
        const first = new File([], "first.png", { type: "image/png" });
        const second = new File([], "second.png", { type: "image/png" });
        expect(createCanvasImportPlan([first, second], { x: 10, y: 20 })).toEqual({
            items: [
                { file: first, position: { x: 10, y: 20 } },
                { file: second, position: { x: 570, y: 20 } },
            ],
        });
        expect(createCanvasImportPlan([], { x: 10, y: 20 })).toBeNull();
    });
});
