import i18n from "../../i18n";
import { imageMetadata, referenceUrl, type CanvasImageMetadataSource } from "./canvas-node-factory";
import type { NodeGenerationInput } from "../../components/canvas/canvas-node-generation";
import type { CanvasImageAngleParams } from "../../components/canvas/canvas-node-angle-dialog";
import type { ReferenceImage } from "../../types/image";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../../types/canvas";
import { hasResumableVideoTask } from "./video-task-handle";
import { isAudioFile } from "../media-file";
export { getResumableVideoTaskHandle, hasResumableVideoTask, hasVideoTaskReference } from "./video-task-handle";
export { isAudioFile } from "../media-file";

export type CanvasGenerationMediaStorage = {
    resolveImage(storageKey?: string, fallback?: string): Promise<string | null>;
    resolveMedia(storageKey?: string, fallback?: string): Promise<string | null>;
    uploadImage(dataUrl: string, signal?: AbortSignal): Promise<CanvasImageMetadataSource>;
};

export function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

export function audioExtension(mimeType?: string) {
    if (mimeType?.includes("wav")) return "wav";
    if (mimeType?.includes("opus")) return "opus";
    if (mimeType?.includes("aac")) return "aac";
    if (mimeType?.includes("flac")) return "flac";
    if (mimeType?.includes("pcm")) return "pcm";
    return "mp3";
}

export function generationReferenceUrls(context: { referenceImages: ReferenceImage[]; referenceVideos: Array<{ storageKey?: string; url?: string }>; referenceAudios?: Array<{ storageKey?: string; url?: string }> }) {
    return [
        ...context.referenceImages.map(referenceUrl).filter((url): url is string => Boolean(url)),
        ...context.referenceVideos.map((video) => video.storageKey || video.url).filter((url): url is string => Boolean(url)),
        ...(context.referenceAudios || []).map((audio) => audio.storageKey || audio.url).filter((url): url is string => Boolean(url)),
    ];
}

export function metadataReferenceImages(metadata: CanvasNodeMetadata): ReferenceImage[] | null {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    return metadata.references.map((url, index) => ({ id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl: url }));
}

export async function hydrateCanvasImages(nodes: CanvasNodeData[], storage: CanvasGenerationMediaStorage, signal?: AbortSignal) {
    signal?.throwIfAborted();
    return Promise.all(
        nodes.map(async (node) => {
            const metadata = node.metadata;
            const content = metadata?.content;
            if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && metadata?.storageKey) {
                const restored = await storage.resolveMedia(metadata.storageKey, content);
                signal?.throwIfAborted();
                return { ...node, metadata: { ...metadata, content: restored || content } };
            }
            if (node.type !== CanvasNodeType.Image || !metadata || !content) return node;
            const images = await Promise.all((metadata.images || []).map(async (image) => {
                if (!image.content) return image;
                const restored = await storage.resolveImage(image.storageKey, image.content);
                signal?.throwIfAborted();
                return { ...image, content: restored || image.content };
            }));
            if (metadata.storageKey) {
                const restored = await storage.resolveImage(metadata.storageKey, content);
                signal?.throwIfAborted();
                return { ...node, metadata: { ...metadata, content: restored || content, images } };
            }
            if (!content.startsWith("data:image/")) return node;
            const uploaded = await storage.uploadImage(content, signal);
            signal?.throwIfAborted();
            return { ...node, metadata: { ...metadata, ...imageMetadata(uploaded) } };
        }),
    );
}

export async function hydrateAssistantImages(sessions: CanvasAssistantSession[], storage: CanvasGenerationMediaStorage, signal?: AbortSignal) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T) => {
        signal?.throwIfAborted();
        if (item.storageKey) {
            const restored = await storage.resolveImage(item.storageKey, item.dataUrl);
            signal?.throwIfAborted();
            return { ...item, dataUrl: restored || item.dataUrl };
        }
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await storage.uploadImage(item.dataUrl, signal);
            signal?.throwIfAborted();
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

export function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}

export function getInputSummary(inputs: NodeGenerationInput[]) {
    const resources = [...new Map(inputs.flatMap((input) => (input.type === "group" ? input.children : [input])).map((input) => [input.nodeId, input])).values()];
    return {
        textCount: resources.filter((input) => input.type === "text").length,
        imageCount: resources.filter((input) => input.type === "image").length,
        videoCount: resources.filter((input) => input.type === "video").length,
        audioCount: resources.filter((input) => input.type === "audio").length,
    };
}

export function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) =>
        node.metadata?.status === "loading"
            ? hasResumableVideoTask(node)
                ? node
                : {
                      ...node,
                      metadata: {
                          ...node.metadata,
                          status: "error" as const,
                          errorDetails: i18n.t("canvas.generation.interrupted"),
                          images: node.metadata.images?.map((image) => (image.status === "loading" ? { ...image, status: "error" as const, errorDetails: i18n.t("canvas.generation.interrupted") } : image)),
                          texts: node.metadata.texts?.map((text) => (text.status === "loading" ? { ...text, status: "error" as const, errorDetails: i18n.t("canvas.generation.interrupted") } : text)),
                      },
                  }
            : node,
    );
}

export function isGenerationCanceled(error: unknown) {
    return error instanceof Error && (error.message === i18n.t("common.requestCanceled") || error.name === "AbortError");
}

export function findRetrySourceNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const queue = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodes.find((item) => item.id === id);
        if (node?.type === CanvasNodeType.Config) return node;
        connections.filter((connection) => connection.toNodeId === id).forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

export function sourceNodeReferenceImages(node: CanvasNodeData | null) {
    if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            assetId: node.metadata.assetId,
            name: `${node.title || node.id}.png`,
            type: node.metadata.mimeType || "image/png",
            dataUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
        },
    ];
}

export function buildAngleLabel(params: CanvasImageAngleParams) {
    const horizontal = params.horizontalAngle === 0 ? i18n.t("canvas.generation.front") : params.horizontalAngle > 0 ? i18n.t("canvas.generation.rotateRight", { angle: params.horizontalAngle }) : i18n.t("canvas.generation.rotateLeft", { angle: Math.abs(params.horizontalAngle) });
    const pitch = params.pitchAngle === 0 ? i18n.t("canvas.generation.level") : params.pitchAngle > 0 ? i18n.t("canvas.generation.topDown", { angle: params.pitchAngle }) : i18n.t("canvas.generation.lowAngle", { angle: Math.abs(params.pitchAngle) });
    return i18n.t("canvas.generation.angleLabel", { horizontal, pitch, distance: params.cameraDistance.toFixed(1), lens: i18n.t(params.wideAngle ? "canvas.editors.wide" : "canvas.editors.standard") });
}

export function buildAnglePrompt(params: CanvasImageAngleParams) {
    return i18n.t("canvas.generation.anglePrompt", { angle: buildAngleLabel(params) });
}
