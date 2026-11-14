import type { CanvasNodeData, ViewportTransform } from "../../types/canvas";

export function getCanvasFitViewport(nodes: CanvasNodeData[], width: number, height: number): ViewportTransform {
    if (!nodes.length) return { x: width / 2, y: height / 2, k: 1 };

    const left = Math.min(...nodes.map((node) => node.position.x));
    const top = Math.min(...nodes.map((node) => node.position.y));
    const right = Math.max(...nodes.map((node) => node.position.x + node.width));
    const bottom = Math.max(...nodes.map((node) => node.position.y + node.height));
    const boundsWidth = Math.max(right - left, 1);
    const boundsHeight = Math.max(bottom - top, 1);
    const availableWidth = Math.max(width - 120, 240);
    const availableHeight = Math.max(height - 160, 180);
    const k = Math.min(Math.max(Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight), 0.05), 5);
    return { x: width / 2 - ((left + right) / 2) * k, y: height / 2 - ((top + bottom) / 2) * k, k };
}

export function getCanvasNodeFocusViewport(node: CanvasNodeData, width: number, height: number): ViewportTransform {
    const worldX = node.position.x + node.width / 2;
    const worldY = node.position.y + node.height / 2;
    const k = Math.min(Math.max(Math.min((width * 0.6) / node.width, (height * 0.6) / node.height), 0.05), 1);
    return { x: width / 2 - worldX * k, y: height / 2 - worldY * k, k };
}

export function getCanvasZoomViewport(viewport: ViewportTransform, scale: number, width: number, height: number): ViewportTransform {
    const k = Math.min(Math.max(scale, 0.05), 5);
    return {
        x: width / 2 - ((width / 2 - viewport.x) / viewport.k) * k,
        y: height / 2 - ((height / 2 - viewport.y) / viewport.k) * k,
        k,
    };
}
