import type { ReferenceImage } from "../../types/image";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../../types/canvas";
import { findRetrySourceNode, metadataReferenceImages } from "../../lib/canvas/canvas-generation-helpers";
import { buildCanvasGenerationConfig, type CanvasGenerationConfig, type CanvasGenerationMode, type CanvasGenerationPreferences } from "./generation-preferences";

export type CanvasRetryPlan = {
    sourceNode: CanvasNodeData;
    savedImageMetadata?: CanvasNodeMetadata;
    usesSavedImageMetadata: boolean;
    generationConfig: CanvasGenerationConfig;
    contextPrompt: string;
};

export type CanvasRetryContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
};

export type CanvasRetryInputs = {
    prompt: string;
    useReferenceImages: boolean;
    savedReferences: ReferenceImage[] | null;
};

export function createCanvasRetryPlan({ node, nodes, connections, preferences }: {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    preferences: CanvasGenerationPreferences;
}): CanvasRetryPlan {
    const sourceNode = findRetrySourceNode(node.id, nodes, connections) || node;
    const savedImageMetadata = node.type === CanvasNodeType.Image ? node.metadata : undefined;
    const usesSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
    const generationConfig: CanvasGenerationConfig = usesSavedImageMetadata && savedImageMetadata
        ? {
              ...preferences,
              model: savedImageMetadata.model || preferences.imageModel || preferences.model,
              quality: savedImageMetadata.quality || preferences.quality,
              size: savedImageMetadata.size || preferences.size,
              background: savedImageMetadata.background ?? preferences.background,
              count: "1",
          }
        : {
              ...buildCanvasGenerationConfig(preferences, sourceNode, retryGenerationMode(node.type)),
              count: "1",
          };

    return {
        sourceNode,
        savedImageMetadata,
        usesSavedImageMetadata,
        generationConfig,
        contextPrompt: sourceNode.metadata?.prompt || node.metadata?.prompt || "",
    };
}

export function resolveCanvasRetryInputs(plan: CanvasRetryPlan, context: CanvasRetryContext | null): CanvasRetryInputs {
    const prompt = (plan.savedImageMetadata?.prompt || context?.prompt || "").trim();
    const generationType = plan.savedImageMetadata?.generationType;
    return {
        prompt,
        useReferenceImages: generationType ? generationType === "edit" : Boolean(context?.referenceImages.length),
        savedReferences: plan.usesSavedImageMetadata && plan.savedImageMetadata ? metadataReferenceImages(plan.savedImageMetadata) : [],
    };
}

function retryGenerationMode(type: CanvasNodeData["type"]): CanvasGenerationMode {
    if (type === CanvasNodeType.Text) return "text";
    if (type === CanvasNodeType.Video) return "video";
    if (type === CanvasNodeType.Audio) return "audio";
    return "image";
}
