import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { useCanvasGenerationRequests } from "@infinite-canvas/core/canvas/generation-requests-hook";

const packageRoot = resolve(import.meta.dirname, "..");
const featureRoot = resolve(packageRoot, "src/features/canvas");

describe("Canvas generation request hook boundary", () => {
    test("exports a hook that owns request registry creation and project lifecycle cleanup", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-generation-requests.ts"), "utf8");
        expect(useCanvasGenerationRequests).toBeTypeOf("function");
        expect(source).toContain("useState(createCanvasGenerationRequestRegistry)");
        expect(source).toContain("useLayoutEffect(() => () => requests.abortAll(), [projectId, requests])");
        expect(source).toContain("requests.start");
        expect(source).toContain("requests.finish");
    });

    test("leaves cancellation UI state updates in the editor", () => {
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(editor).toContain("const affectedNodeIds = stopGenerationRequests(runningId)");
        expect(editor).toContain("applyCanvasGenerationCancellation");
    });
});
