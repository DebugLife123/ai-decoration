import type { CanvasConnection, CanvasNodeData } from "../../types/canvas";

export function removeCanvasNodes(nodes: CanvasNodeData[], connections: CanvasConnection[], removedIds: Set<string>) {
    if (!removedIds.size) return { nodes, connections };
    const nextNodes = nodes
        .filter((node) => !removedIds.has(node.id))
        .map((node) => node.metadata?.groupId && removedIds.has(node.metadata.groupId) ? { ...node, metadata: { ...node.metadata, groupId: undefined } } : node);
    return {
        nodes: nextNodes,
        connections: connections.filter((connection) => !removedIds.has(connection.fromNodeId) && !removedIds.has(connection.toNodeId)),
    };
}
