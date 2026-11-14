import { describe, expect, test } from "vitest";
import { resolveCanvasKeyboardShortcut } from "../src/features/canvas/keyboard-shortcuts";

describe("Canvas keyboard shortcut resolver", () => {
    test("resolves undo, redo, select all, copy and paste", () => {
        expect(resolveCanvasKeyboardShortcut({ key: "z", ctrlKey: true })).toEqual({ command: "undo", preventDefault: true });
        expect(resolveCanvasKeyboardShortcut({ key: "z", metaKey: true, shiftKey: true })).toEqual({ command: "redo", preventDefault: true });
        expect(resolveCanvasKeyboardShortcut({ key: "y", ctrlKey: true })).toEqual({ command: "redo", preventDefault: true });
        expect(resolveCanvasKeyboardShortcut({ key: "a", ctrlKey: true })).toEqual({ command: "select-all", preventDefault: true });
        expect(resolveCanvasKeyboardShortcut({ key: "c", ctrlKey: true })).toEqual({ command: "copy", preventDefault: true });
        expect(resolveCanvasKeyboardShortcut({ key: "v", ctrlKey: true })).toEqual({ command: "paste", preventDefault: true });
    });

    test("does not intercept browser text copy or modified shortcuts with Alt", () => {
        expect(resolveCanvasKeyboardShortcut({ key: "c", ctrlKey: true, hasSelectedText: true })).toBeNull();
        expect(resolveCanvasKeyboardShortcut({ key: "z", ctrlKey: true, altKey: true })).toBeNull();
    });

    test("only resolves group shortcuts when the selected nodes support them", () => {
        expect(resolveCanvasKeyboardShortcut({ key: "g", ctrlKey: true, canGroup: true })).toEqual({ command: "group", preventDefault: true });
        expect(resolveCanvasKeyboardShortcut({ key: "g", ctrlKey: true, canGroup: false })).toBeNull();
        expect(resolveCanvasKeyboardShortcut({ key: "g", ctrlKey: true, shiftKey: true, canUngroup: true })).toEqual({ command: "ungroup", preventDefault: true });
        expect(resolveCanvasKeyboardShortcut({ key: "g", ctrlKey: true, shiftKey: true, canUngroup: false })).toBeNull();
    });

    test("prioritizes selected nodes over a selected connection for deletion", () => {
        expect(resolveCanvasKeyboardShortcut({ key: "Delete", hasSelectedNodes: true, hasSelectedConnection: true })).toEqual({ command: "delete-nodes", preventDefault: false });
        expect(resolveCanvasKeyboardShortcut({ key: "Backspace", hasSelectedConnection: true })).toEqual({ command: "delete-connection", preventDefault: false });
        expect(resolveCanvasKeyboardShortcut({ key: "Delete" })).toBeNull();
    });

    test("resolves Escape without preventing the browser default", () => {
        expect(resolveCanvasKeyboardShortcut({ key: "Escape" })).toEqual({ command: "clear-interaction", preventDefault: false });
    });
});
