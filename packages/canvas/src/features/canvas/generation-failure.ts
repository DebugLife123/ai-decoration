import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";
import { isVideoTaskFailed, isVideoTaskTimeout } from "../../services/api/video-errors";
import { resolveCanvasGenerationOutcome } from "./generation-outcome";

export type CanvasGenerationFailureOutcome =
    | { kind: "canceled" }
    | { kind: "failed"; message: string; videoTaskFailed: boolean; videoTimedOut: boolean };

export function resolveCanvasGenerationFailure(
    error: unknown,
    signal: AbortSignal | undefined,
    fallbackMessage: string,
    isCanceled: (error: unknown) => boolean,
): CanvasGenerationFailureOutcome {
    const outcome = resolveCanvasGenerationOutcome(error, signal, fallbackMessage, isCanceled);
    if (outcome.kind === "canceled") return outcome;
    return {
        ...outcome,
        videoTaskFailed: isVideoTaskFailed(error),
        videoTimedOut: isVideoTaskTimeout(error),
    };
}

export type CanvasGenerationFailure = {
    nodeId: string;
    errorDetails: string;
    imageId?: string;
    videoTimedOut?: boolean;
    videoTaskFailed?: boolean;
};

export type CanvasGenerationTargetsFailure = {
    nodeIds: string[];
    skipNodeId?: string;
    errorDetails: string;
    videoTimedOut?: boolean;
    videoTaskFailed?: boolean;
};

export function applyCanvasGenerationFailure(nodes: CanvasNodeData[], failure: CanvasGenerationFailure): CanvasNodeData[] {
    return nodes.map((node) => {
        if (node.id !== failure.nodeId) return node;
        const hasContent = Boolean(node.metadata?.content);
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: hasContent ? ("success" as const) : ("error" as const),
                errorDetails: hasContent ? undefined : failure.errorDetails,
                ...(failure.videoTimedOut && !hasContent && node.type === CanvasNodeType.Video ? { errorCode: "timeout" as const } : {}),
                images: node.metadata?.images?.map((image) => (image.id === failure.imageId ? { ...image, status: "error" as const, errorDetails: failure.errorDetails } : image)),
                ...(failure.videoTaskFailed && node.type === CanvasNodeType.Video ? { videoTaskId: undefined } : {}),
            },
        };
    });
}

export function applyCanvasGenerationTargetsFailure(nodes: CanvasNodeData[], failure: CanvasGenerationTargetsFailure): CanvasNodeData[] {
    const targetIds = new Set(failure.nodeIds);
    return nodes.map((node) => {
        if (!targetIds.has(node.id) || node.id === failure.skipNodeId) return node;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: "error" as const,
                errorDetails: failure.errorDetails,
                ...(failure.videoTimedOut && node.type === CanvasNodeType.Video ? { errorCode: "timeout" as const } : {}),
                ...(failure.videoTaskFailed && node.type === CanvasNodeType.Video ? { videoTaskId: undefined } : {}),
            },
        };
    });
}
