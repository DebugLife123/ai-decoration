import { NODE_DEFAULT_SIZE } from "../../constant/canvas";
import { nodeSizeFromRatio } from "../../lib/canvas/canvas-node-size";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../../types/canvas";

function updateCanvasNode(nodes: CanvasNodeData[], nodeId: string, update: (node: CanvasNodeData) => CanvasNodeData): CanvasNodeData[] {
    return nodes.map((node) => (node.id === nodeId ? update(node) : node));
}

export function updateCanvasNodeContent(nodes: CanvasNodeData[], nodeId: string, content: string): CanvasNodeData[] {
    return updateCanvasNode(nodes, nodeId, (node) => ({
        ...node,
        metadata: {
            ...node.metadata,
            content,
            texts: node.metadata?.texts?.map((text) => (text.id === node.metadata?.primaryTextId ? { ...text, content } : text)),
        },
    }));
}

export function updateCanvasNodeTitle(nodes: CanvasNodeData[], nodeId: string, title: string): CanvasNodeData[] {
    return updateCanvasNode(nodes, nodeId, (node) => ({ ...node, title }));
}

export function updateCanvasNodePrompt(nodes: CanvasNodeData[], nodeId: string, prompt: string): CanvasNodeData[] {
    return updateCanvasNode(nodes, nodeId, (node) => ({ ...node, metadata: { ...node.metadata, prompt } }));
}

export function updateCanvasNodeFontSize(nodes: CanvasNodeData[], nodeId: string, fontSize: number): CanvasNodeData[] {
    return updateCanvasNode(nodes, nodeId, (node) => ({ ...node, metadata: { ...node.metadata, fontSize } }));
}

export function markCanvasNodeError(nodes: CanvasNodeData[], nodeId: string, errorDetails: string): CanvasNodeData[] {
    return updateCanvasNode(nodes, nodeId, (node) => ({ ...node, metadata: { ...node.metadata, status: "error" as const, errorDetails } }));
}

export function applyCanvasNodeConfigPatch(nodes: CanvasNodeData[], nodeId: string, patch: Partial<CanvasNodeMetadata>): CanvasNodeData[] {
    return updateCanvasNode(nodes, nodeId, (node) => {
        const safePatch = patch || {};
        const next = { ...node, metadata: { ...node.metadata, ...safePatch } };
        const spec = node.type === CanvasNodeType.Video ? NODE_DEFAULT_SIZE[CanvasNodeType.Video] : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
        const size = typeof safePatch.size === "string" && !node.metadata?.content ? nodeSizeFromRatio(safePatch.size, spec.width, spec.height) : null;
        return size && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video)
            ? { ...next, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } }
            : next;
    });
}
