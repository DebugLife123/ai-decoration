import { canvasAssetMetadata } from "./asset-metadata";
import { fitNodeSize } from "../../lib/canvas/canvas-node-size";
import type { CanvasImportedVideo } from "./contracts";
import type { CanvasNodeData } from "../../types/canvas";

const VIDEO_RESULT_MAX_SIZE = 420;

export function applyCanvasVideoResult(item: CanvasNodeData, video: CanvasImportedVideo, extra: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    const size = fitNodeSize(video.width || item.width, video.height || item.height, VIDEO_RESULT_MAX_SIZE, VIDEO_RESULT_MAX_SIZE);
    return {
        ...item,
        ...size,
        position: { x: item.position.x + item.width / 2 - size.width / 2, y: item.position.y + item.height / 2 - size.height / 2 },
        metadata: { ...item.metadata, ...canvasAssetMetadata(video), ...extra },
    };
}
