import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { useCanvasImageDerivativeActions } from "@infinite-canvas/core/canvas/image-derivative-actions";

const packageRoot = resolve(import.meta.dirname, "..");
const featureRoot = resolve(packageRoot, "src/features/canvas");

describe("Canvas image derivative actions boundary", () => {
    test("exports crop/upscale execution and checks each operation token", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-image-derivative-actions.ts"), "utf8");
        expect(useCanvasImageDerivativeActions).toBeTypeOf("function");
        expect(source).toContain("createCroppedImageNode");
        expect(source).toContain("createUpscaledImageNode");
        expect(source).toContain("if (cropRequest.current !== request) return");
        expect(source).toContain("if (upscaleRequest.current !== request) return");
    });

    test("keeps React node/connection insertion in the editor and leaves mask/split flows separate", () => {
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        const splitHook = readFileSync(resolve(featureRoot, "use-canvas-image-split-actions.ts"), "utf8");
        const maskHook = readFileSync(resolve(featureRoot, "use-canvas-mask-asset-actions.ts"), "utf8");
        expect(editor).toContain("setNodes((prev) => [...prev, child])");
        expect(editor).toContain("setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: source.id, toNodeId: child.id }])");
        expect(editor).toContain("useCanvasImageSplitActions");
        expect(editor).toContain("useCanvasMaskAssetActions");
        expect(splitHook).toContain("prepareImageSplit");
        expect(maskHook).toContain("createMaskImageNode");
    });
});
