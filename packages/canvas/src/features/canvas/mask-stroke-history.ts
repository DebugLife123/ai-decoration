export type CanvasMaskDrawMode = "paint" | "erase";
export type CanvasMaskPoint = { x: number; y: number };
export type CanvasMaskStroke = { mode: CanvasMaskDrawMode; size: number; points: CanvasMaskPoint[] };
export type CanvasMaskStrokeHistory = { undo: CanvasMaskStroke[]; redo: CanvasMaskStroke[] };

export function commitCanvasMaskStroke(history: CanvasMaskStrokeHistory, stroke: CanvasMaskStroke): CanvasMaskStrokeHistory {
    return stroke.points.length ? { undo: [...history.undo, stroke], redo: [] } : history;
}

export function undoCanvasMaskStroke(history: CanvasMaskStrokeHistory): CanvasMaskStrokeHistory {
    const stroke = history.undo.at(-1);
    return stroke ? { undo: history.undo.slice(0, -1), redo: [...history.redo, stroke] } : history;
}

export function redoCanvasMaskStroke(history: CanvasMaskStrokeHistory): CanvasMaskStrokeHistory {
    const stroke = history.redo.at(-1);
    return stroke ? { undo: [...history.undo, stroke], redo: history.redo.slice(0, -1) } : history;
}

export function resetCanvasMaskStrokeHistory(): CanvasMaskStrokeHistory {
    return { undo: [], redo: [] };
}
