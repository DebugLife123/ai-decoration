import { CanvasNodeType, type CanvasNodeData, type CanvasVideoTaskHandle } from "../../types/canvas";

const remoteVideoProviders = ["openai", "gemini", "grok", "seedance", "kling", "agnes"] as const;

export function getResumableVideoTaskHandle(node: CanvasNodeData): CanvasVideoTaskHandle | null {
    const metadata = node.metadata;
    const id = metadata?.videoTaskId?.trim();
    const model = metadata?.videoTaskModel?.trim();
    const provider = metadata?.videoTaskProvider;
    if (!id || !model || !provider || !remoteVideoProviders.includes(provider)) return null;
    return { id, provider, model };
}

export function hasResumableVideoTask(node: CanvasNodeData) {
    return node.type === CanvasNodeType.Video && Boolean(getResumableVideoTaskHandle(node)) && !node.metadata?.content;
}

export function hasVideoTaskReference(node: CanvasNodeData) {
    return node.type === CanvasNodeType.Video && Boolean(node.metadata?.videoTaskId?.trim()) && !node.metadata?.content;
}
