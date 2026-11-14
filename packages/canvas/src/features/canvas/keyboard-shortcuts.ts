export type CanvasKeyboardCommand =
    | "undo"
    | "redo"
    | "select-all"
    | "group"
    | "ungroup"
    | "copy"
    | "paste"
    | "delete-nodes"
    | "delete-connection"
    | "clear-interaction";

export interface CanvasKeyboardShortcutInput {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    hasSelectedText?: boolean;
    hasSelectedNodes?: boolean;
    hasSelectedConnection?: boolean;
    canGroup?: boolean;
    canUngroup?: boolean;
}

export interface CanvasKeyboardShortcutResult {
    command: CanvasKeyboardCommand;
    preventDefault: boolean;
}

/** Resolves canvas shortcuts without reading DOM or mutating editor state. */
export function resolveCanvasKeyboardShortcut(input: CanvasKeyboardShortcutInput): CanvasKeyboardShortcutResult | null {
    const key = input.key.toLowerCase();
    const modified = Boolean(input.metaKey || input.ctrlKey);

    if (modified && key === "c" && input.hasSelectedText) return null;

    if (modified && !input.altKey && key === "z") {
        return { command: input.shiftKey ? "redo" : "undo", preventDefault: true };
    }

    if (modified && !input.altKey && key === "y") return { command: "redo", preventDefault: true };
    if (modified && !input.altKey && key === "a") return { command: "select-all", preventDefault: true };

    if (modified && !input.altKey && key === "g") {
        if (input.shiftKey && input.canUngroup) return { command: "ungroup", preventDefault: true };
        if (!input.shiftKey && input.canGroup) return { command: "group", preventDefault: true };
        return null;
    }

    if (modified && !input.altKey && key === "c") return { command: "copy", preventDefault: true };
    if (modified && !input.altKey && key === "v") return { command: "paste", preventDefault: true };

    if (input.key === "Delete" || input.key === "Backspace") {
        if (input.hasSelectedNodes) return { command: "delete-nodes", preventDefault: false };
        if (input.hasSelectedConnection) return { command: "delete-connection", preventDefault: false };
    }

    if (input.key === "Escape") return { command: "clear-interaction", preventDefault: false };
    return null;
}
