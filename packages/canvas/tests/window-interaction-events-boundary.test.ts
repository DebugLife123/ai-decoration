import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { useCanvasWindowInteractionEvents } from "@infinite-canvas/core/canvas/window-interaction-events";

const packageRoot = resolve(import.meta.dirname, "..");
const featureRoot = resolve(packageRoot, "src/features/canvas");

describe("Canvas window interaction boundary", () => {
    test("exports the listener lifecycle hook without moving interaction decisions", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-window-interaction-events.ts"), "utf8");
        expect(useCanvasWindowInteractionEvents).toBeTypeOf("function");
        expect(source).toContain("window.addEventListener");
        expect(source).toContain("window.removeEventListener");
        expect(source).not.toContain("setNodes");
        expect(source).not.toContain("connectNodes");
    });

    test("selection gesture hook owns pointer-move selection updates only", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-selection-gesture.ts"), "utf8");
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(source).toContain("resolveCanvasSelectionMove");
        expect(source).toContain("clearSelectionGesture");
        expect(source).toContain("nodesRef.current");
        expect(source).not.toContain("connectNodes");
        expect(source).not.toContain("finishNodeDrag");
        expect(editor).toContain("selectionGesture.onPointerMove");
        expect(editor).toContain("selectionGesture.clearSelectionGesture()");
    });

    test("node drag hook owns drag-frame scheduling while connection hook owns connection hover", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-node-drag-gesture.ts"), "utf8");
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(source).toContain("createCanvasNodeDragState");
        expect(source).toContain("finishCanvasNodeDrag");
        expect(source).toContain("resolveCanvasNodeDragEnd");
        expect(source).toContain("const finish = useCallback");
        expect(source).toContain("const start = useCallback");
        expect(source).toContain("requestAnimationFrame");
        expect(source).toContain("cancelAnimationFrame");
        expect(source).toContain("useEffect(() => cancelPendingFrame");
        expect(source).not.toContain("resolveCanvasConnectionHover");
        expect(editor).toContain("nodeDragGesture.onMouseMove(event)");
        expect(editor).toContain("nodeDragGesture.start");
        expect(editor).toContain("const finishNodeDrag = nodeDragGesture.finish");
        expect(editor).toContain("connectionGesture.onMouseMove(event)");
        expect(editor).not.toContain("rafRef");
        expect(editor).not.toContain("resolveCanvasNodeDragEnd");
        expect(editor).not.toContain("finishCanvasNodeDrag(prev");
    });

    test("connection gesture hook owns hover and drop decisions while editor keeps node creation", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-connection-gesture.ts"), "utf8");
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(source).toContain("resolveCanvasConnectionHover");
        expect(source).toContain("resolveCanvasConnectionDrop");
        expect(source).toContain("setPendingConnectionCreate");
        expect(source).toContain("Dispatch<SetStateAction<CanvasConnectionCreateRequest | null>>");
        expect(source).toContain("connectNodes(current, action.nodeId)");
        expect(editor).toContain("connectionGesture.onMouseMove(event)");
        expect(editor).toContain("connectionGesture.onMouseUp(event)");
        expect(editor).toContain("const createConnectedNode = useCallback");
        expect(editor).not.toContain("resolveCanvasConnectionDrop");
        expect(editor).not.toContain("resolveCanvasConnectionHover");
    });

    test("viewport gesture hook owns pan, zoom, temporary tools, and window listeners", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-viewport-gesture.ts"), "utf8");
        const canvas = readFileSync(resolve(packageRoot, "src/components/canvas/infinite-canvas.tsx"), "utf8");
        expect(source).toContain("requestAnimationFrame");
        expect(source).toContain("cancelAnimationFrame");
        expect(source).toContain("handleWheel");
        expect(source).toContain("handlePointerDown");
        expect(source).toContain('event.code !== "Space"');
        expect(source).toContain('window.addEventListener("pointermove"');
        expect(canvas).toContain("useCanvasViewportGesture");
        expect(canvas).not.toContain("window.addEventListener");
        expect(canvas).not.toContain("requestAnimationFrame");
    });

    test("viewport command hook owns fit, focus animation, reset, and zoom actions", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-viewport-commands.ts"), "utf8");
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(source).toContain("getCanvasFitViewport");
        expect(source).toContain("getCanvasNodeFocusViewport");
        expect(source).toContain("getCanvasZoomViewport");
        expect(source).toContain("cancelAnimationFrame(focusAnimRef.current)");
        expect(source).toContain("setSelectedNodeIds(new Set([nodeId]))");
        expect(editor).toContain("useCanvasViewportCommands");
        expect(editor).not.toContain("const focusNode = useCallback");
        expect(editor).not.toContain("const fitCanvasToNodes = useCallback");
    });

    test("project interaction reset is isolated from document loading", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-project-interaction-reset.ts"), "utf8");
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(source).toContain("previousProjectIdRef");
        expect(source).toContain("resetCanvasProjectInteraction");
        expect(source).toContain("setNodeImageSettingsOpen(false)");
        expect(source).toContain("resetInteraction()");
        expect(editor).toContain("resetProjectInteraction");
        expect(editor).toContain("useCanvasProjectInteractionReset(projectId, resetProjectInteraction)");
        expect(editor).toContain("resetCanvasProjectInteraction({");
        expect(editor).not.toContain("setExpandedBatchNodeIds(new Set());");
    });
});
