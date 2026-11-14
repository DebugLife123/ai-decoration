import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { useCanvasVersionRestore } from "@infinite-canvas/core/canvas/version-restore-hook";

const packageRoot = resolve(import.meta.dirname, "..");
const featureRoot = resolve(packageRoot, "src/features/canvas");

describe("Canvas version restore hook boundary", () => {
    test("owns restore request cancellation and keeps the document command reusable", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-version-restore.ts"), "utf8");
        expect(useCanvasVersionRestore).toBeTypeOf("function");
        expect(source).toContain("restoreCanvasVersionDocument");
        expect(source).toContain("controllerRef.current?.abort()");
        expect(source).toContain("if (controller.signal.aborted) return null");
        expect(source).toContain("currentDocument.current = restored");
    });

    test("leaves restored canvas state and UI messaging in the editor", () => {
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(editor).toContain("const { nodes: restoredNodes, connections: restoredConnections, viewport: restoredViewport } = restoredDocument;");
        expect(editor).toContain("message.success(t(\"canvas.versions.restoredSuccess\"");
        expect(editor).toContain("setHistoryState({ canUndo: false, canRedo: false });");
    });
});
