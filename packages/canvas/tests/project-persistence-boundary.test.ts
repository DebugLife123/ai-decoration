import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { useCanvasProjectPersistence } from "@infinite-canvas/core/canvas/project-persistence";

const packageRoot = resolve(import.meta.dirname, "..");
const featureRoot = resolve(packageRoot, "src/features/canvas");

describe("Canvas project persistence boundary", () => {
    test("exports a reusable hook that owns document and viewport autosave effects", () => {
        const persistence = readFileSync(resolve(featureRoot, "use-project-persistence.ts"), "utf8");
        expect(useCanvasProjectPersistence).toBeTypeOf("function");
        expect(persistence).toContain("createCanvasAutosaveDocument");
        expect(persistence).toContain("saveCanvasViewportSnapshot");
        expect(persistence).toContain("isCanvasProjectSaveScopeCurrent");
    });

    test("keeps project and React state application in the shared editor", () => {
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(editor).toContain("useCanvasProjectPersistence({");
        expect(editor).toContain("applyRestoredProject");
        expect(editor).not.toContain("createCanvasAutosaveDocument");
        expect(editor).not.toContain("saveCanvasViewportSnapshot");
    });

    test("publishes the persistence hook as a package subpath", () => {
        const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
        expect(manifest.exports["./canvas/project-persistence"]).toBe("./src/features/canvas/use-project-persistence.ts");
    });
});
