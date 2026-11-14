import { useEffect } from "react";
import { resolveCanvasKeyboardShortcut, type CanvasKeyboardCommand, type CanvasKeyboardShortcutInput } from "./keyboard-shortcuts";

type CanvasKeyboardState = Pick<CanvasKeyboardShortcutInput, "hasSelectedText" | "hasSelectedNodes" | "hasSelectedConnection" | "canGroup" | "canUngroup">;

export function useCanvasKeyboardShortcuts({
    getState,
    onCommand,
}: {
    getState: () => CanvasKeyboardState;
    onCommand: (command: CanvasKeyboardCommand) => void;
}) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom],[data-canvas-shortcuts-ignore]")) return;

            const command = resolveCanvasKeyboardShortcut({
                key: event.key,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                ...getState(),
            });
            if (!command) return;
            if (command.preventDefault) event.preventDefault();
            onCommand(command.command);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [getState, onCommand]);
}
