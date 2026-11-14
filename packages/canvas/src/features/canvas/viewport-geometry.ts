import { normalizeCanvasConnection } from "./connection-actions";
import type { CanvasNodeData, ConnectionHandle, Position, ViewportTransform } from "../../types/canvas";

export type CanvasViewportSize = { width: number; height: number };
export type CanvasConnectionDropTarget = { nodeId: string | null; isNearNode: boolean };

export { selectCanvasNodesInBox } from "./selection-geometry";

export function getCanvasConnectionTargetAnchor(node: CanvasNodeData, current: ConnectionHandle) {
    return {
        x: current.handleType === "source" ? node.position.x : node.position.x + node.width,
        y: node.position.y + node.height / 2,
    };
}

export function getVisibleCanvasNodes(nodes: CanvasNodeData[], viewport: ViewportTransform, size: CanvasViewportSize, padding = 280) {
    const viewLeft = -viewport.x / viewport.k - padding;
    const viewTop = -viewport.y / viewport.k - padding;
    const viewRight = viewLeft + size.width / viewport.k + padding * 2;
    const viewBottom = viewTop + size.height / viewport.k + padding * 2;
    return nodes.filter((node) => node.position.x + node.width > viewLeft && node.position.x < viewRight && node.position.y + node.height > viewTop && node.position.y < viewBottom);
}

export function findCanvasConnectionDropTarget(world: Position, scale: number, current: ConnectionHandle, nodes: CanvasNodeData[], nodePadding = 32, handleHitRadius = 40): CanvasConnectionDropTarget {
    const safeScale = Math.max(scale, 0.05);
    const padding = nodePadding / safeScale;
    const handleRadius = handleHitRadius / safeScale;
    let isNearNode = false;
    let bestNodeId: string | null = null;
    let bestPriority = Number.POSITIVE_INFINITY;

    [...nodes].reverse().forEach((node) => {
        const anchor = getCanvasConnectionTargetAnchor(node, current);
        const dx = world.x - anchor.x;
        const dy = world.y - anchor.y;
        const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
        const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
        const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;
        if (!hitsHandle && !hitsInside && !hitsExpanded) return;
        isNearNode = true;
        if (node.id === current.nodeId || !normalizeCanvasConnection(current.nodeId, node.id, nodes, current.handleType)) return;
        const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
        if (priority < bestPriority) {
            bestNodeId = node.id;
            bestPriority = priority;
        }
    });
    return { nodeId: bestNodeId, isNearNode };
}
