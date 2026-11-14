import type { CanvasGenerationConfig } from "./generation-preferences";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";
import type { ReferenceImage } from "../../types/image";

export type CanvasImageGenerationPlanInput = {
    nodeId: string;
    sourceNode?: CanvasNodeData;
    prompt: string;
    config: CanvasGenerationConfig;
    count: number;
    references: ReferenceImage[];
    sizes: { config: { width: number; height: number }; image: { width: number; height: number }; text: { width: number; height: number } };
    createId: () => string;
};

export type CanvasImageGenerationPlan = {
    sourceNodeId: string;
    rootId: string;
    imageIds: string[];
    isConfigNode: boolean;
    isImageNode: boolean;
    isEmptyImageNode: boolean;
    rootNode: CanvasNodeData;
    textSize: { width: number; height: number };
};

export function createCanvasImageGenerationPlan(input: CanvasImageGenerationPlanInput): CanvasImageGenerationPlan {
    const { nodeId, sourceNode, prompt, config, count, references, sizes, createId } = input;
    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
    const parentConfig = isConfigNode ? sizes.config : isImageNode ? sizes.image : sizes.text;
    const imageConfig = sizes.image;
    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
    const rootId = isEmptyImageNode ? nodeId : createId();
    const imageIds = Array.from({ length: count }, createId);
    const generationType = references.length ? "edit" : "generation";
    const rootNode: CanvasNodeData = {
        id: rootId,
        type: CanvasNodeType.Image,
        title: prompt.slice(0, 32) || "Generated Image",
        position: {
            x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + 96,
            y: parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2,
        },
        width: isEmptyImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width,
        height: isEmptyImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height,
        metadata: {
            prompt,
            status: "loading",
            images: imageIds.map((id) => ({ id, status: "loading", content: "", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" })),
            generationType,
            model: config.model,
            size: config.size,
            quality: config.quality,
            ...(config.background ? { background: config.background } : {}),
            count: imageIds.length,
            references: references.map((reference) => reference.storageKey || reference.url || (!reference.dataUrl.startsWith("data:") ? reference.dataUrl : undefined)).filter((url): url is string => Boolean(url)),
        },
    };
    return { sourceNodeId: nodeId, rootId, imageIds, isConfigNode, isImageNode, isEmptyImageNode, rootNode, textSize: sizes.text };
}

export function applyCanvasImageGenerationPlan(nodes: CanvasNodeData[], plan: CanvasImageGenerationPlan, prompt: string): CanvasNodeData[] {
    return [
        ...nodes.map((node) => {
            if (node.id !== plan.sourceNodeId) return node;
            if (plan.isConfigNode) return { ...node, metadata: { ...node.metadata, status: "loading" as const, errorDetails: undefined, errorCode: undefined } };
            if (plan.isEmptyImageNode) return { ...node, position: plan.rootNode.position, width: plan.rootNode.width, height: plan.rootNode.height, title: plan.rootNode.title, metadata: { ...node.metadata, ...plan.rootNode.metadata, errorDetails: undefined } };
            if (plan.isImageNode) return { ...node, metadata: { ...node.metadata, status: "success" as const, errorDetails: undefined } };
            return { ...node, type: CanvasNodeType.Text, title: prompt.slice(0, 32) || "Prompt", width: plan.textSize.width, height: plan.textSize.height, metadata: { ...node.metadata, content: prompt, prompt, status: "success" as const, fontSize: 14, errorDetails: undefined } };
        }),
        ...(plan.isEmptyImageNode ? [] : [plan.rootNode]),
    ];
}
