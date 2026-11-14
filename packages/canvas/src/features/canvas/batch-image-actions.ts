import { fitNodeSize } from "../../lib/canvas/canvas-node-size";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";

export function setCanvasBatchPrimary(node: CanvasNodeData, itemId: string): CanvasNodeData {
    if (node.type === CanvasNodeType.Text) {
        const text = node.metadata?.texts?.find((item) => item.id === itemId);
        return text?.content ? { ...node, metadata: { ...node.metadata, content: text.content, primaryTextId: text.id } } : node;
    }

    const image = node.metadata?.images?.find((item) => item.id === itemId);
    if (!image?.content) return node;
    const edge = Math.max(node.width, node.height);
    const size = node.metadata?.freeResize ? { width: node.width, height: node.height } : fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
    return {
        ...node,
        position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 },
        ...size,
        metadata: {
            ...node.metadata,
            content: image.content,
            assetId: image.assetId,
            taskId: undefined,
            versionId: undefined,
            storageKey: image.storageKey,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            bytes: image.bytes,
            mimeType: image.mimeType,
            primaryImageId: image.id,
        },
    };
}

export function createCanvasBatchImageCopy(node: CanvasNodeData, imageId: string, id: string): CanvasNodeData | null {
    const image = node.metadata?.images?.find((item) => item.id === imageId);
    if (!image?.content) return null;
    const edge = Math.max(node.width, node.height);
    const size = fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
    return {
        id,
        type: CanvasNodeType.Image,
        title: node.title,
        position: { x: node.position.x + node.width * 2 + 96, y: node.position.y + node.height / 2 - size.height / 2 },
        ...size,
        metadata: {
            content: image.content,
            assetId: image.assetId,
            storageKey: image.storageKey,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            bytes: image.bytes,
            mimeType: image.mimeType,
            status: "success",
            prompt: node.metadata?.prompt,
            generationType: node.metadata?.generationType,
            model: node.metadata?.model,
            size: node.metadata?.size,
            quality: node.metadata?.quality,
            background: node.metadata?.background,
            references: node.metadata?.references,
        },
    };
}

export function deleteCanvasBatchImage(nodes: CanvasNodeData[], nodeId: string, imageId: string): CanvasNodeData[] {
    return nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const images = node.metadata?.images?.filter((image) => image.id !== imageId) || [];
        return {
            ...node,
            metadata: {
                ...node.metadata,
                images,
                count: images.length,
                primaryImageId: node.metadata?.primaryImageId === imageId ? images[0]?.id : node.metadata?.primaryImageId,
            },
        };
    });
}
