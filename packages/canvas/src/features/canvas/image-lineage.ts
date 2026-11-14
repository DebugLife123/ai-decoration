import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types/canvas";

export type CanvasImageLineagePair = { source: CanvasNodeData; result: CanvasNodeData };

export function getCanvasImageLineagePairs(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasImageLineagePair[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Map<string, CanvasNodeData[]>();
    for (const connection of connections) {
        const source = byId.get(connection.fromNodeId);
        const result = byId.get(connection.toNodeId);
        if (source?.type !== CanvasNodeType.Image || result?.type !== CanvasNodeType.Image || result.metadata?.generationType !== "edit") continue;
        incoming.set(result.id, [...(incoming.get(result.id) || []), source]);
    }

    return nodes.flatMap((result) => {
        if (result.type !== CanvasNodeType.Image || result.metadata?.generationType !== "edit") return [];
        const source = result.metadata.sourceNodeId ? byId.get(result.metadata.sourceNodeId) : incoming.get(result.id)?.length === 1 ? incoming.get(result.id)?.[0] : undefined;
        return source?.type === CanvasNodeType.Image && source.metadata?.content && result.metadata?.content ? [{ source, result }] : [];
    });
}
