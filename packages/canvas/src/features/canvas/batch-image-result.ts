import { fitNodeSize } from "../../lib/canvas/canvas-node-size";
import type { CanvasNodeData, CanvasNodeImage } from "../../types/canvas";
import type { CanvasBatchImageAttempt } from "./batch-image-execution";

export type CanvasBatchImageResult = {
    rootNodeId: string;
    image: CanvasNodeImage;
    defaultImageSize: { width: number; height: number };
};

export type CanvasBatchImageSummaryResult = {
    sourceNodeId: string;
    rootNodeId: string;
    configNodeId?: string;
    hasSuccess: boolean;
    failureMessage: string;
    allFailedMessage: string;
};

export function applyCanvasBatchImageSummary(nodes: CanvasNodeData[], result: CanvasBatchImageSummaryResult): CanvasNodeData[] {
    return nodes.map((node) => {
        const isConfigNode = result.configNodeId === node.id && result.sourceNodeId === node.id;
        const isRootNode = result.rootNodeId === node.id;
        if (!isConfigNode && !isRootNode) return node;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: result.hasSuccess ? "success" : "error",
                errorDetails: result.hasSuccess ? undefined : isConfigNode ? result.failureMessage : result.allFailedMessage,
            },
        };
    });
}

export function applyCanvasBatchImageResult(nodes: CanvasNodeData[], result: CanvasBatchImageResult): CanvasNodeData[] {
    return nodes.map((node) => {
        if (node.id !== result.rootNodeId) return node;
        const images = node.metadata?.images?.map((image) => (image.id === result.image.id ? result.image : image)) || [];
        if (node.metadata?.primaryImageId) return { ...node, metadata: { ...node.metadata, images } };
        const size = fitNodeSize(result.image.naturalWidth, result.image.naturalHeight, result.defaultImageSize.width, result.defaultImageSize.height);
        const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
        return {
            ...node,
            position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
            ...size,
            metadata: {
                ...node.metadata,
                content: result.image.content,
                assetId: result.image.assetId,
                taskId: undefined,
                versionId: undefined,
                storageKey: result.image.storageKey,
                naturalWidth: result.image.naturalWidth,
                naturalHeight: result.image.naturalHeight,
                bytes: result.image.bytes,
                mimeType: result.image.mimeType,
                images,
                primaryImageId: result.image.id,
            },
        };
    });
}

export function applyCanvasBatchImageAttemptResult(
    nodes: CanvasNodeData[],
    result: {
        rootNodeId: string;
        imageId: string;
        configNodeId?: string;
        defaultImageSize: { width: number; height: number };
        attempt: CanvasBatchImageAttempt;
    },
): CanvasNodeData[] {
    if (result.attempt.status === "canceled") return nodes;
    if (result.attempt.status === "failed") {
        const errorDetails = result.attempt.errorDetails;
        return nodes.map((node) => node.id !== result.rootNodeId ? node : {
            ...node,
            metadata: {
                ...node.metadata,
                images: node.metadata?.images?.map((image) => image.id === result.imageId
                    ? { ...image, status: "error" as const, errorDetails }
                    : image),
            },
        });
    }

    const updated = applyCanvasBatchImageResult(nodes, {
        rootNodeId: result.rootNodeId,
        image: result.attempt.image,
        defaultImageSize: result.defaultImageSize,
    });
    return result.configNodeId
        ? updated.map((node) => node.id === result.configNodeId ? { ...node, metadata: { ...node.metadata, status: "success" as const, errorDetails: undefined } } : node)
        : updated;
}
