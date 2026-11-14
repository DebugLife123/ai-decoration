import type { Position, ViewportTransform } from "../../types/canvas";

export type CanvasClientRect = Pick<DOMRect, "left" | "top">;

export function screenPointToCanvas(client: Position, rect: CanvasClientRect | null, viewport: ViewportTransform): Position {
    return {
        x: (client.x - (rect?.left || 0) - viewport.x) / viewport.k,
        y: (client.y - (rect?.top || 0) - viewport.y) / viewport.k,
    };
}
