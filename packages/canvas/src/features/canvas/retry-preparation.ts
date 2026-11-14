import { buildNodeGenerationContext, hydrateNodeGenerationContext, type NodeGenerationContext } from "../../components/canvas/canvas-node-generation";
import type { ReferenceImage } from "../../types/image";
import type { CanvasConnection, CanvasNodeData } from "../../types/canvas";
import type { CanvasMediaAdapter } from "./media";
import { readCanvasReferenceImages } from "./media";
import { resolveCanvasRetryInputs, type CanvasRetryPlan } from "./retry-plan";

export type CanvasRetryPreparation = {
    context: NodeGenerationContext | null;
    prompt: string;
    useReferenceImages: boolean;
    savedReferences: ReferenceImage[] | null;
};

export async function prepareCanvasRetry({ plan, nodes, connections, media, projectId, signal }: {
    plan: CanvasRetryPlan;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    media: CanvasMediaAdapter;
    projectId: string;
    signal: AbortSignal;
}): Promise<CanvasRetryPreparation> {
    const context = plan.usesSavedImageMetadata
        ? null
        : await hydrateNodeGenerationContext(buildNodeGenerationContext(plan.sourceNode.id, nodes, connections, plan.contextPrompt), media, projectId, signal);
    signal.throwIfAborted();
    return { context, ...resolveCanvasRetryInputs(plan, context) };
}

export async function readCanvasRetryReferences({ plan, preparation, media, projectId, signal }: {
    plan: CanvasRetryPlan;
    preparation: CanvasRetryPreparation;
    media: CanvasMediaAdapter;
    projectId: string;
    signal: AbortSignal;
}): Promise<ReferenceImage[]> {
    if (!plan.usesSavedImageMetadata) return preparation.context?.referenceImages || [];
    const references = await readCanvasReferenceImages(media, projectId, preparation.savedReferences || [], signal);
    signal.throwIfAborted();
    return references;
}
