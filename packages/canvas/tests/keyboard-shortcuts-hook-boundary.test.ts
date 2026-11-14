import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { useCanvasKeyboardShortcuts } from "@infinite-canvas/core/canvas/keyboard-shortcuts-hook";

const packageRoot = resolve(import.meta.dirname, "..");
const featureRoot = resolve(packageRoot, "src/features/canvas");

describe("Canvas keyboard shortcut hook boundary", () => {
    test("exports a hook that filters DOM targets and resolves shortcut commands", () => {
        const source = readFileSync(resolve(featureRoot, "use-canvas-keyboard-shortcuts.ts"), "utf8");
        expect(useCanvasKeyboardShortcuts).toBeTypeOf("function");
        expect(source).toContain("resolveCanvasKeyboardShortcut");
        expect(source).toContain("HTMLInputElement");
        expect(source).toContain("contenteditable='true'");
        expect(source).toContain("window.removeEventListener(\"keydown\", handleKeyDown)");
    });

    test("leaves canvas command effects in the shared editor", () => {
        const editor = readFileSync(resolve(featureRoot, "canvas-editor.tsx"), "utf8");
        expect(editor).toContain("const handleKeyboardCommand = useCallback");
        expect(editor).toContain("useCanvasKeyboardShortcuts({ getState: getKeyboardShortcutState, onCommand: handleKeyboardCommand })");
    });
});
