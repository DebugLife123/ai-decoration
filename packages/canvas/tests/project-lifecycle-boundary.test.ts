import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
const { useCanvasProjectLifecycle } = await import("@infinite-canvas/core/canvas/project-lifecycle");

const featureRoot = resolve(import.meta.dirname, "../src/features/canvas");

describe("Canvas project lifecycle boundary", () => {
    test("owns project restore cancellation and load retry state in its hook", () => {
        const lifecycle = readFileSync(resolve(featureRoot, "use-project-lifecycle.ts"), "utf8");
        expect(useCanvasProjectLifecycle).toBeTypeOf("function");
        expect(lifecycle).toContain("restoreCanvasProjectDocument");
        expect(lifecycle).toContain("new AbortController()");
        expect(lifecycle).toContain("return () => controller.abort()");
        expect(lifecycle).toContain("setAttempt((current) => current + 1)");
    });

    test("keeps canvas state application in the editor callback", () => {
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(editor).toContain("useCanvasProjectLifecycle({");
        expect(editor).toContain("onRestore: applyRestoredProject");
        expect(editor).not.toContain("restoreCanvasProjectDocument(");
    });

    test("declares the lifecycle hook as a public package subpath", () => {
        const manifest = JSON.parse(readFileSync(resolve(featureRoot, "../../../package.json"), "utf8"));
        expect(manifest.exports["./canvas/project-lifecycle"]).toBe("./src/features/canvas/use-project-lifecycle.ts");
    });
});
