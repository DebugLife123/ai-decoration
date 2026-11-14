import { CanvasNodeType, type CanvasNodeData, type CanvasNodeText } from "../../types/canvas";

export function applyCanvasTextDelta(nodes: CanvasNodeData[], rootNodeId: string, textId: string, content: string): CanvasNodeData[] {
    return nodes.map((node) => node.id === rootNodeId
        ? {
              ...node,
              metadata: {
                  ...node.metadata,
                  ...(node.metadata?.primaryTextId === textId ? { content } : {}),
                  texts: node.metadata?.texts?.map((text) => text.id === textId ? { ...text, content } : text),
              },
          }
        : node);
}

export function applyCanvasTextResult(nodes: CanvasNodeData[], rootNodeId: string, result: CanvasNodeText): CanvasNodeData[] {
    return nodes.map((node) => node.id === rootNodeId
        ? {
              ...node,
              metadata: {
                  ...node.metadata,
                  ...(node.metadata?.primaryTextId === result.id ? { content: result.content } : {}),
                  texts: node.metadata?.texts?.map((text) => text.id === result.id ? { ...text, ...result } : text),
              },
          }
        : node);
}

export function applyCanvasTextNodeDelta(nodes: CanvasNodeData[], nodeId: string, content: string): CanvasNodeData[] {
    return nodes.map((node) => node.id === nodeId
        ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content, status: "loading" as const } }
        : node);
}

export function applyCanvasTextNodeResult(nodes: CanvasNodeData[], nodeId: string, content: string, prompt: string): CanvasNodeData[] {
    return nodes.map((node) => node.id === nodeId
        ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content, prompt, status: "success" as const } }
        : node);
}
