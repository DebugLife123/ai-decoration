import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { useCanvasFileImport } from "@infinite-canvas/core/canvas/file-import-hook";

const packageRoot = resolve(import.meta.dirname, "..");
const featureRoot = resolve(packageRoot, "src/features/canvas");

describe("Canvas file import hook boundary", () => {
    test("exports an importer hook that keeps cancellation and failure mapping at the feature boundary", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-file-import.ts"), "utf8");
        expect(useCanvasFileImport).toBeTypeOf("function");
        expect(source).toContain("scopeRef.current.signal");
        expect(source).toContain("resolveCanvasFileImportFailures");
        expect(source).toContain("onNodeImported");
    });

    test("leaves DOM event and React selection updates in the editor", () => {
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(editor).toContain("const handleImageInputChange");
        expect(editor).toContain("setSelectedNodeIds");
        expect(editor).toContain("replaceCanvasNodeInList");
    });
});
