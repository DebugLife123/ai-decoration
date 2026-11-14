import type { CanvasConnection, CanvasNodeData, Position } from "../../types/canvas";

export type CanvasClipboard = { nodes: CanvasNodeData[]; connections: CanvasConnection[] };

export function duplicateCanvasNode(node: CanvasNodeData, id: string): CanvasNodeData {
    return {
        ...node,
        id,
        title: `${node.title} Copy`,
        position: { x: node.position.x + 36, y: node.position.y + 36 },
    };
}

export function copyCanvasSelection(nodes: CanvasNodeData[], connections: CanvasConnection[], selectedIds: Set<string>): CanvasClipboard | null {
    if (!selectedIds.size) return null;
    const copiedNodes = nodes
        .filter((node) => selectedIds.has(node.id))
        .map((node) => ({ ...node, position: { ...node.position }, metadata: node.metadata ? { ...node.metadata } : undefined }));
    if (!copiedNodes.length) return null;
    return {
        nodes: copiedNodes,
        connections: connections.filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
    };
}

export function pasteCanvasClipboard(
    clipboard: CanvasClipboard,
    center: Position,
    createNodeId: (node: CanvasNodeData, index: number) => string,
    createConnectionId: (connection: CanvasConnection, index: number) => string,
) {
    if (!clipboard.nodes.length) return null;
    const bounds = clipboard.nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const dx = center.x - (bounds.left + bounds.right) / 2;
    const dy = center.y - (bounds.top + bounds.bottom) / 2;
    const idMap = new Map<string, string>();
    const nodes = clipboard.nodes.map((node, index) => {
        const id = createNodeId(node, index);
        idMap.set(node.id, id);
        return {
            ...node,
            id,
            title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
            position: { x: node.position.x + dx, y: node.position.y + dy },
            metadata: node.metadata ? { ...node.metadata } : undefined,
        };
    }).map((node) => {
        const groupId = node.metadata?.groupId;
        return groupId ? { ...node, metadata: { ...node.metadata, groupId: idMap.get(groupId) } } : node;
    });
    const connections = clipboard.connections.flatMap((connection, index) => {
        const fromNodeId = idMap.get(connection.fromNodeId);
        const toNodeId = idMap.get(connection.toNodeId);
        if (!fromNodeId || !toNodeId) return [];
        return [{ ...connection, id: createConnectionId(connection, index), fromNodeId, toNodeId }];
    });
    return { nodes, connections };
}
