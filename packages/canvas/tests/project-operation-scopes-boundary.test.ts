import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { useCanvasProjectOperationScopes } from "@infinite-canvas/core/canvas/project-operation-scopes";

const packageRoot = resolve(import.meta.dirname, "..");
const featureRoot = resolve(packageRoot, "src/features/canvas");

describe("Canvas project operation scopes boundary", () => {
    test("owns project-scoped abort and request token refs", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-project-operation-scopes.ts"), "utf8");
        expect(useCanvasProjectOperationScopes).toBeTypeOf("function");
        expect(source).toContain("useLayoutEffect");
        expect(source).toContain("imageImport.current = new AbortController()");
        expect(source).toContain("imageImport.current.abort()");
        expect(source).toContain("upscaleRequest.current = null");
    });

    test("leaves operation state and UI behavior in the editor", () => {
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(editor).toContain("setCropSaving");
        expect(editor).toContain("setMaskSaving");
        expect(editor).toContain("setSplitSaving");
        expect(editor).toContain("setUpscaleSaving");
    });
});
