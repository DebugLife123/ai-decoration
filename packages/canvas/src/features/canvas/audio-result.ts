import type { CanvasNodeData } from "../../types/canvas";
import type { CanvasImportedAudio } from "./contracts";
import { canvasAssetMetadata } from "./asset-metadata";

export function applyCanvasAudioResult(item: CanvasNodeData, audio: CanvasImportedAudio, extra: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return {
        ...item,
        metadata: { ...item.metadata, ...canvasAssetMetadata(audio), ...extra },
    };
}
