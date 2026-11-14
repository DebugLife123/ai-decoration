import type { CanvasGenerationConfig } from "./generation-preferences";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";

export type CanvasTextGenerationPlan = {
    sourceNodeId: string;
    rootId: string;
    textIds: string[];
    isConfigNode: boolean;
    isEmptyTextNode: boolean;
    rootNode: CanvasNodeData;
};

export function createCanvasTextGenerationPlan(input: {
    nodeId: string;
    sourceNode?: CanvasNodeData;
    reuseSource: boolean;
    prompt: string;
    config: Pick<CanvasGenerationConfig, "model" | "reasoningEffort">;
    textCount: number;
    sizes: { config: { width: number; height: number }; text: { width: number; height: number } };
    createId: () => string;
}): CanvasTextGenerationPlan {
    const { nodeId, sourceNode, reuseSource, prompt, config, textCount, sizes, createId } = input;
    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
    const isEmptyTextNode = sourceNode?.type === CanvasNodeType.Text && reuseSource;
    const parentSize = isConfigNode ? sizes.config : sizes.text;
    const rootId = isEmptyTextNode ? nodeId : createId();
    const textIds = Array.from({ length: textCount }, createId);
    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
    const rootNode: CanvasNodeData = {
        id: rootId,
        type: CanvasNodeType.Text,
        title: prompt.slice(0, 32) || "Generated Text",
        position: isEmptyTextNode
            ? sourceNode.position
            : { x: parentPosition.x + parentSize.width + 96, y: parentPosition.y + parentSize.height / 2 - sizes.text.height / 2 },
        width: isEmptyTextNode ? sourceNode.width : sizes.text.width,
        height: isEmptyTextNode ? sourceNode.height : sizes.text.height,
        metadata: {
            prompt,
            status: "loading",
            fontSize: 14,
            model: config.model,
            reasoningEffort: config.reasoningEffort,
            textCount,
            texts: textIds.map((id) => ({ id, status: "loading", content: "" })),
            primaryTextId: textIds[0],
        },
    };
    return { sourceNodeId: nodeId, rootId, textIds, isConfigNode, isEmptyTextNode, rootNode };
}

export function applyCanvasTextGenerationPlan(nodes: CanvasNodeData[], plan: CanvasTextGenerationPlan): CanvasNodeData[] {
    return plan.isEmptyTextNode
        ? nodes.map((node) => (node.id === plan.sourceNodeId ? { ...node, ...plan.rootNode } : node))
        : [
              ...nodes.map((node) => (node.id === plan.sourceNodeId && plan.isConfigNode ? { ...node, metadata: { ...node.metadata, status: "loading" as const, errorDetails: undefined, errorCode: undefined } } : node)),
              plan.rootNode,
          ];
}
