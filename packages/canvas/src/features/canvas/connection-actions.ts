import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types/canvas";

export function normalizeCanvasConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target") {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id || second.type === CanvasNodeType.Group) return null;
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id };
    return { fromNodeId: first.id, toNodeId: second.id };
}

export function hasCanvasConnection(connections: CanvasConnection[], fromNodeId: string, toNodeId: string): boolean {
    return connections.some((connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId);
}

export function removeCanvasConnection(connections: CanvasConnection[], connectionId: string): CanvasConnection[] {
    return connections.filter((connection) => connection.id !== connectionId);
}

export function disconnectCanvasReference(connections: CanvasConnection[], fromNodeId: string, toNodeId: string): CanvasConnection[] {
    return connections.filter((connection) => connection.fromNodeId !== fromNodeId || connection.toNodeId !== toNodeId);
}
