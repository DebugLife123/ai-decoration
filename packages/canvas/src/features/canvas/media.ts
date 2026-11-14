import { CanvasNodeType, type CanvasAssistantSession, type CanvasNodeData } from "../../types/canvas";
import type { ReferenceImage } from "../../types/image";
import { CanvasApiError, type CanvasAssetContentApi } from "./contracts";
import i18n from "../../i18n";

export type CanvasMediaSnapshot = {
    nodes: CanvasNodeData[];
    chatSessions: CanvasAssistantSession[];
};

export type CanvasMediaReference = { name: string; type?: string; url?: string; storageKey?: string; assetId?: string };

export type CanvasMediaCleanupReason = "node-removed" | "canvas-cleared" | "project-deleted";

export type CanvasMediaCleanupContext = {
    projectId: string;
    reason: CanvasMediaCleanupReason;
    history?: unknown;
    lastHistory?: unknown;
    extra?: unknown;
};

export type CanvasMediaAdapter = {
    restore(projectId: string, snapshot: CanvasMediaSnapshot, signal: AbortSignal): Promise<CanvasMediaSnapshot>;
    readImage(projectId: string, image: ReferenceImage, signal: AbortSignal): Promise<string>;
    readMedia(projectId: string, reference: CanvasMediaReference, signal: AbortSignal): Promise<Blob>;
    cleanup(context: CanvasMediaCleanupContext): void;
};

async function blobToDataUrl(blob: Blob, fallbackMimeType?: string) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    const base64 = btoa(binary);
    return `data:${blob.type || fallbackMimeType || "application/octet-stream"};base64,${base64}`;
}

export function createCanvasApiMediaAdapter(api: CanvasAssetContentApi): CanvasMediaAdapter {
    const readAsset = async (projectId: string, assetId: string, signal: AbortSignal) => {
        signal.throwIfAborted();
        const asset = await api.getAsset(projectId, assetId);
        if (asset.projectId !== projectId) throw new CanvasApiError("ASSET_PROJECT_MISMATCH", "素材不属于当前项目", { projectId, assetId, actualProjectId: asset.projectId });
        if (asset.assetId !== assetId) throw new CanvasApiError("ASSET_ID_MISMATCH", "素材 ID 与请求不匹配", { projectId, assetId, actualAssetId: asset.assetId });
        const content = await api.readAssetContent(projectId, assetId, signal);
        signal.throwIfAborted();
        if (!content.size) throw new CanvasApiError("ASSET_CONTENT_MISSING", `素材内容为空：${assetId}`, { projectId, assetId });
        return { asset, content };
    };
    const readAssetDataUrl = async (projectId: string, assetId: string, signal: AbortSignal) => {
        const { asset, content } = await readAsset(projectId, assetId, signal);
        const dataUrl = await blobToDataUrl(content, asset.mimeType);
        signal.throwIfAborted();
        return { asset, dataUrl };
    };
    const readImage = async (projectId: string, image: ReferenceImage, signal: AbortSignal) => {
        if (!image.assetId) {
            signal.throwIfAborted();
            if (image.dataUrl) return image.dataUrl;
            throw new Error(`无法读取参考素材：${image.name}`);
        }
        const { asset, dataUrl } = await readAssetDataUrl(projectId, image.assetId, signal);
        if (asset.kind !== "IMAGE") throw new CanvasApiError("ASSET_KIND_MISMATCH", "参考图片指向了非图片素材", { projectId, assetId: image.assetId, actualKind: asset.kind });
        return dataUrl;
    };
    const restoreAssistantSessions = async (projectId: string, sessions: CanvasAssistantSession[], signal: AbortSignal) => Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(async (reference) => {
                        if (reference.type !== CanvasNodeType.Image || !reference.assetId) return reference;
                        const dataUrl = await readImage(projectId, { id: reference.id, assetId: reference.assetId, name: reference.title, type: "image/png", dataUrl: reference.dataUrl || "" }, signal);
                        return { ...reference, dataUrl };
                    })),
                })),
            ),
        })),
    );
    return {
        async restore(projectId, snapshot, signal) {
            const nodes = await Promise.all(snapshot.nodes.map(async (node) => {
                const metadata = node.metadata;
                if (!metadata) return node;
                if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && metadata.assetId) {
                    const { asset, dataUrl } = await readAssetDataUrl(projectId, metadata.assetId, signal);
                    const expectedKind = node.type === CanvasNodeType.Video ? "VIDEO" : "AUDIO";
                    if (asset.kind !== expectedKind) throw new CanvasApiError("ASSET_KIND_MISMATCH", "节点类型与素材类型不匹配", { projectId, assetId: metadata.assetId, expectedKind, actualKind: asset.kind });
                    return {
                        ...node,
                        metadata: {
                            ...metadata,
                            content: dataUrl,
                            mimeType: asset.mimeType,
                            durationMs: asset.durationMs,
                            naturalWidth: asset.kind === "VIDEO" ? asset.width : undefined,
                            naturalHeight: asset.kind === "VIDEO" ? asset.height : undefined,
                        },
                    };
                }
                if (node.type !== CanvasNodeType.Image) return node;
                const [content, images] = await Promise.all([
                    metadata.assetId ? readImage(projectId, { id: node.id, assetId: metadata.assetId, name: node.title || node.id, type: metadata.mimeType || "image/png", dataUrl: metadata.content || "" }, signal) : metadata.content,
                    metadata.images ? Promise.all(metadata.images.map(async (image) => image.assetId
                        ? { ...image, content: await readImage(projectId, { id: image.id, assetId: image.assetId, name: image.id, type: image.mimeType, dataUrl: image.content }, signal) }
                        : image)) : undefined,
                ]);
                return { ...node, metadata: { ...metadata, content, ...(images ? { images } : {}) } };
            }));
            const chatSessions = await restoreAssistantSessions(projectId, snapshot.chatSessions, signal);
            return { nodes, chatSessions };
        },
        readImage,
        async readMedia(projectId, reference, signal) {
            if (reference.assetId) return (await readAsset(projectId, reference.assetId, signal)).content;
            signal.throwIfAborted();
            if (!reference.url) throw new Error(`无法读取参考素材：${reference.name}`);
            const response = await fetch(reference.url, { signal });
            if (!response.ok) throw new Error(`无法读取参考素材：${reference.name}`);
            signal.throwIfAborted();
            return response.blob();
        },
        cleanup(_context) {},
    };
}

export async function readCanvasReferenceMedia(adapter: CanvasMediaAdapter, projectId: string, reference: CanvasMediaReference, signal: AbortSignal): Promise<Blob> {
    signal.throwIfAborted();
    const blob = await adapter.readMedia(projectId, { ...reference }, signal);
    signal.throwIfAborted();
    return blob;
}

export async function readCanvasReferenceImages(adapter: CanvasMediaAdapter, projectId: string, images: ReferenceImage[], signal: AbortSignal): Promise<ReferenceImage[]> {
    signal.throwIfAborted();
    const references = await Promise.all(images.map(async (image) => {
        const dataUrl = await adapter.readImage(projectId, { ...image }, signal);
        signal.throwIfAborted();
        if (!dataUrl) throw new Error(i18n.t("canvas.projectPage.referenceMissing"));
        return { ...image, dataUrl };
    }));
    signal.throwIfAborted();
    return references;
}

export async function restoreCanvasMedia(adapter: CanvasMediaAdapter, projectId: string, snapshot: CanvasMediaSnapshot, signal: AbortSignal) {
    signal.throwIfAborted();
    // Hosts may materialize URLs, but must never mutate a saved project or version.
    const restored = await adapter.restore(projectId, structuredClone(snapshot), signal);
    signal.throwIfAborted();
    return restored;
}
