import { describe, expect, test, vi } from "vitest";
import { CanvasNodeType } from "../src/types/canvas";
import { createCanvasImportedFileNode, importCanvasFile, importCanvasFileAsNode, replaceCanvasNodeInList, replaceCanvasNodeWithImportedFile, resolveCanvasFileImportFailures, runCanvasFileImportBatch, runCanvasImportPlan } from "../src/features/canvas/file-import";

const image = { projectId: "project", assetId: "image", name: "room.png", kind: "IMAGE" as const, mimeType: "image/png", url: "data:image/png;base64,", width: 10, height: 10, bytes: 1, createdAt: "now" };
const video = { ...image, assetId: "video", name: "clip.mp4", kind: "VIDEO" as const, mimeType: "video/mp4", width: 960, height: 540, durationMs: 1000 };
const audio = { projectId: "project", assetId: "audio", name: "voice.wav", kind: "AUDIO" as const, mimeType: "audio/wav", url: "blob:audio", bytes: 1, durationMs: 1000, createdAt: "now" };

describe("Canvas file import coordinator", () => {
    test("selects the host importer and validates the project", async () => {
        const importImage = vi.fn().mockResolvedValue(image);
        const result = await importCanvasFile({ projectId: "project", mode: "local", importImage }, new File([], "room.png", { type: "image/png" }));
        expect(importImage).toHaveBeenCalledWith("project", expect.any(File), undefined);
        expect(result).toEqual({ kind: "image", asset: image });
    });

    test("rejects unavailable Mock media and missing host importers", async () => {
        const importImage = vi.fn().mockResolvedValue(image);
        await expect(importCanvasFile({ projectId: "project", mode: "mock", importImage }, new File([], "clip.mp4", { type: "video/mp4" }))).rejects.toThrow("Mock");
        await expect(importCanvasFile({ projectId: "project", mode: "local", importImage }, new File([], "clip.mp4", { type: "video/mp4" }))).rejects.toThrow("视频导入");
    });

    test("dispatches host video and audio importers", async () => {
        const importImage = vi.fn().mockResolvedValue(image);
        const importVideo = vi.fn().mockResolvedValue(video);
        const importAudio = vi.fn().mockResolvedValue(audio);
        const host = { projectId: "project", mode: "local" as const, importImage, importVideo, importAudio };
        expect(await importCanvasFile(host, new File([], "clip.mp4", { type: "video/mp4" }))).toEqual({ kind: "video", asset: video });
        expect(await importCanvasFile(host, new File([], "voice.wav"))).toEqual({ kind: "audio", asset: audio });
        expect(importVideo).toHaveBeenCalledOnce();
        expect(importAudio).toHaveBeenCalledOnce();
    });

    test("builds nodes with media-aware sizes and metadata", () => {
        const node = createCanvasImportedFileNode("video-node", "clip.mp4", { x: 300, y: 200 }, { kind: "video", asset: video });
        expect(node).toMatchObject({ id: "video-node", type: CanvasNodeType.Video, width: 420, position: { x: 90 }, metadata: { assetId: "video", durationMs: 1000 } });
        expect(node.height).toBeCloseTo(236.25);
        expect(node.position.y).toBeCloseTo(81.875);
        const audioNode = createCanvasImportedFileNode("audio-node", "voice.wav", { x: 300, y: 200 }, { kind: "audio", asset: audio });
        expect(audioNode).toMatchObject({ type: CanvasNodeType.Audio, width: 340, height: 120, position: { x: 130, y: 140 } });
    });

    test("imports a file into a node command with a kind-specific ID and details behavior", async () => {
        const host = { projectId: "project", mode: "local" as const, importImage: vi.fn().mockResolvedValue(image), importVideo: vi.fn().mockResolvedValue(video), importAudio: vi.fn().mockResolvedValue(audio) };
        const createId = (kind: string) => `${kind}-node`;
        const imageResult = await importCanvasFileAsNode(host, new File([], image.name, { type: image.mimeType }), { x: 100, y: 200 }, createId);
        const audioResult = await importCanvasFileAsNode(host, new File([], audio.name, { type: audio.mimeType }), { x: 100, y: 200 }, createId);

        expect(imageResult).toMatchObject({ node: { id: "image-node", position: { x: -80, y: 20 } }, opensDetails: true });
        expect(audioResult).toMatchObject({ node: { id: "audio-node" }, opensDetails: false });
    });

    test("preserves image replacement position while clearing generation fields", () => {
        const source = { id: "source", type: CanvasNodeType.Image, title: "old", position: { x: 20, y: 30 }, width: 200, height: 100, metadata: { content: "old", prompt: "old prompt", model: "old-model", images: [], primaryImageId: "old" } };
        const result = replaceCanvasNodeWithImportedFile(source, "room.png", { kind: "image", asset: image });
        expect(result).toMatchObject({ id: "source", title: "room.png", type: CanvasNodeType.Image, position: { x: 20, y: 30 }, metadata: { assetId: "image", prompt: "old prompt", model: undefined, images: undefined, primaryImageId: undefined } });
    });

    test("replaces only the requested node in a node list", () => {
        const source = { id: "source", type: CanvasNodeType.Image, title: "old", position: { x: 20, y: 30 }, width: 200, height: 100, metadata: { content: "old" } };
        const other = { id: "other", type: CanvasNodeType.Text, title: "other", position: { x: 0, y: 0 }, width: 100, height: 50, metadata: { content: "text" } };
        const [updated, unchanged] = replaceCanvasNodeInList([source, other], "source", "room.png", { kind: "image", asset: image });
        expect(updated).toMatchObject({ id: "source", title: "room.png", metadata: { assetId: "image" } });
        expect(unchanged).toBe(other);
        expect(replaceCanvasNodeInList([source], "missing", "room.png", { kind: "image", asset: image })[0]).toBe(source);
    });

    test("rejects cancellation during import, pre-cancelled work, and cross-project results", async () => {
        const controller = new AbortController();
        let resolveImport!: (value: typeof image) => void;
        const pending = importCanvasFile({ projectId: "project", mode: "local", importImage: () => new Promise((resolve) => { resolveImport = resolve; }) }, new File([], "room.png", { type: "image/png" }), controller.signal);
        controller.abort();
        resolveImport(image);
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });

        const preCancelled = new AbortController();
        preCancelled.abort();
        await expect(importCanvasFile({ projectId: "project", mode: "local", importImage: vi.fn() }, new File([], "room.png", { type: "image/png" }), preCancelled.signal)).rejects.toMatchObject({ name: "AbortError" });
        await expect(importCanvasFile({ projectId: "project", mode: "local", importImage: vi.fn().mockResolvedValue({ ...image, projectId: "other" }) }, new File([], "room.png", { type: "image/png" }))).rejects.toThrow("当前项目");
    });

    test("runs files concurrently and preserves each success or failure with its position", async () => {
        const first = new File([], "first.png", { type: "image/png" });
        const second = new File([], "second.png", { type: "image/png" });
        const third = new File([], "third.png", { type: "image/png" });
        const started: File[] = [];
        let finish!: (value: string) => void;
        const batch = runCanvasFileImportBatch([
            { file: first, position: { x: 1, y: 1 } },
            { file: second, position: { x: 2, y: 2 } },
            { file: third, position: { x: 3, y: 3 } },
        ], async (file) => {
            started.push(file);
            if (file === second) throw new Error("bad file");
            if (file === first) return new Promise<string>((resolve) => { finish = resolve; });
            return "third result";
        });
        expect(started).toEqual([first, second, third]);
        finish("first result");
        expect(await batch).toEqual([
            { file: first, position: { x: 1, y: 1 }, status: "fulfilled", value: "first result" },
            { file: second, position: { x: 2, y: 2 }, status: "rejected", reason: new Error("bad file") },
            { file: third, position: { x: 3, y: 3 }, status: "fulfilled", value: "third result" },
        ]);
    });

    test("resolves batch failures while ignoring successes and canceled items", () => {
        const canceled = { name: "AbortError" };
        const failures = resolveCanvasFileImportFailures([
            { file: new File([], "ok.png"), position: { x: 0, y: 0 }, status: "fulfilled", value: "ok" },
            { file: new File([], "bad.png"), position: { x: 0, y: 0 }, status: "rejected", reason: new Error("读取失败") },
            { file: new File([], "cancel.png"), position: { x: 0, y: 0 }, status: "rejected", reason: canceled },
            { file: new File([], "unknown.png"), position: { x: 0, y: 0 }, status: "rejected", reason: "unknown" },
        ], (reason) => reason === canceled, "素材导入失败");

        expect(failures).toEqual([
            { fileName: "bad.png", message: "读取失败" },
            { fileName: "unknown.png", message: "素材导入失败" },
        ]);
    });

    test("runs replacement before new nodes and keeps batch failures isolated", async () => {
        const replacement = new File([], "replacement.png", { type: "image/png" });
        const extra = new File([], "extra.png", { type: "image/png" });
        const host = { projectId: "project", mode: "local" as const, importImage: vi.fn().mockResolvedValue(image) };
        const imported: string[] = [];
        const onReplacement = vi.fn(() => imported.push("replacement"));
        const result = await runCanvasImportPlan(
            { replacement: { nodeId: "source", file: replacement }, items: [{ file: extra, position: { x: 10, y: 20 } }] },
            host,
            async (file) => { imported.push(file.name); return file.name; },
            undefined,
            onReplacement,
        );

        expect(result.replacement).toMatchObject({ status: "fulfilled", nodeId: "source", file: replacement, value: { kind: "image" } });
        expect(onReplacement).toHaveBeenCalledOnce();
        expect(imported).toEqual(["replacement", "extra.png"]);
        expect(result.items).toMatchObject([{ status: "fulfilled", value: "extra.png" }]);
    });
});
