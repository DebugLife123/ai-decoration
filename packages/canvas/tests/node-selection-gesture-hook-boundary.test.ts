import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { useCanvasNodeSelectionGesture } from "@infinite-canvas/core/canvas/node-selection-gesture-hook";

const packageRoot = resolve(import.meta.dirname, "..");
const featureRoot = resolve(packageRoot, "src/features/canvas");

describe("node selection gesture boundary", () => {
    it("keeps capture selection and drag start outside CanvasEditor", () => {
        const hook = readFileSync(resolve(featureRoot, "use-canvas-node-selection-gesture.ts"), "utf8");
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");

        expect(useCanvasNodeSelectionGesture).toBeTypeOf("function");
        expect(hook).toContain("pendingSelectionRef");
        expect(hook).toContain("selectCanvasNode");
        expect(hook).toContain("startNodeDrag");
        expect(editor).toContain('from "./use-canvas-node-selection-gesture"');
        expect(editor).not.toContain("const pendingSelectionRef = useRef");
        expect(editor).not.toContain("const selectNodeByEvent = useCallback");
    });
});
