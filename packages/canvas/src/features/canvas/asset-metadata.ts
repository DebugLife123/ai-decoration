import type { CanvasAssistantSession, CanvasNodeData, CanvasNodeMetadata } from "../../types/canvas";
import type { CanvasImportedImage, CanvasProjectAsset } from "./contracts";

export function canvasAssetMetadata(asset: CanvasProjectAsset & Partial<Pick<CanvasImportedImage, "bytes" | "storageKey">>): CanvasNodeMetadata {
    return {
        content: asset.url,
        status: "success",
        assetId: asset.assetId,
        naturalWidth: asset.kind === "AUDIO" ? undefined : asset.width,
        naturalHeight: asset.kind === "AUDIO" ? undefined : asset.height,
        mimeType: asset.mimeType,
        bytes: asset.bytes,
        storageKey: asset.storageKey,
        durationMs: asset.kind === "IMAGE" ? undefined : asset.durationMs,
        taskId: undefined,
        versionId: undefined,
        videoTaskId: undefined,
        videoTaskProvider: undefined,
        videoTaskModel: undefined,
    };
}

export function isCanvasAssetReferencedByNodes(nodes: CanvasNodeData[], assetId: string) {
    return nodes.some((node) => node.metadata?.assetId === assetId || node.metadata?.images?.some((image) => image.assetId === assetId));
}

export function isCanvasAssetReferencedByAssistantSessions(sessions: CanvasAssistantSession[], assetId: string) {
    return sessions.some((session) => session.messages.some((message) => message.references?.some((reference) => reference.assetId === assetId)));
}
