import { getGroupResourceNodes } from "../../lib/canvas/canvas-resource-references";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types/canvas";

export function countCanvasGroupChildren(nodes: CanvasNodeData[]) {
    const counts = new Map<string, number>();
    nodes.forEach((node) => {
        const groupId = node.metadata?.groupId;
        if (groupId) counts.set(groupId, (counts.get(groupId) || 0) + 1);
    });
    return counts;
}

export function buildCanvasConnectedNodesByTarget(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const connectedNodes = new Map<string, CanvasNodeData[]>();
    connections.forEach((connection) => {
        const source = nodeById.get(connection.fromNodeId);
        if (!source) return;
        const connected = connectedNodes.get(connection.toNodeId);
        if (connected) connected.push(source);
        else connectedNodes.set(connection.toNodeId, [source]);
    });
    return connectedNodes;
}

export function getCanvasRelatedHighlight(activeNodeId: string | null, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeIds = new Set<string>();
    const connectionIds = new Set<string>();
    if (!activeNodeId) return { nodeIds, connectionIds };

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const addNode = (nodeId: string) => {
        nodeIds.add(nodeId);
        if (nodeById.get(nodeId)?.type === CanvasNodeType.Group) {
            nodes.forEach((node) => node.metadata?.groupId === nodeId && nodeIds.add(node.id));
        }
    };
    addNode(activeNodeId);
    connections.forEach((connection) => {
        if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
        connectionIds.add(connection.id);
        addNode(connection.fromNodeId);
        addNode(connection.toNodeId);
    });
    return { nodeIds, connectionIds };
}

export function getCanvasReferenceConnectedNodeIds(
    pickerNodeId: string | null,
    connectedNodesByTarget: Map<string, CanvasNodeData[]>,
    nodes: CanvasNodeData[],
) {
    if (!pickerNodeId) return new Set<string>();
    const ids = new Set([pickerNodeId]);
    connectedNodesByTarget.get(pickerNodeId)?.forEach((node) => {
        ids.add(node.id);
        if (node.type === CanvasNodeType.Group) getGroupResourceNodes(node.id, nodes).forEach((child) => ids.add(child.id));
    });
    return ids;
}
