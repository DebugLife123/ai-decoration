import { CanvasNodeType, type CanvasNodeData, type Position } from "../../types/canvas";

export function resizeCanvasNode(nodes: CanvasNodeData[], nodeId: string, width: number, height: number, position?: Position) {
    return nodes.map((node) => node.id === nodeId ? { ...node, width, height, position: position || node.position } : node);
}

export function toggleCanvasNodeFreeResize(nodes: CanvasNodeData[], nodeId: string) {
    return nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const freeResize = !node.metadata?.freeResize;
        if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
        const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
        const height = node.width / ratio;
        return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
    });
}
