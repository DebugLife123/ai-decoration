import { fitCanvasAssetNodeSize } from "../../lib/canvas/canvas-node-size";
import { CanvasNodeType, type CanvasNodeData, type Position } from "../../types/canvas";
import type { CanvasEditorAssetCommand, CanvasProjectAsset } from "./contracts";
import { canvasAssetMetadata } from "./asset-metadata";

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;

export function createCanvasProjectAssetNode(asset: CanvasProjectAsset, id: string, center: Position, audioSize: { width: number; height: number }, command?: Pick<CanvasEditorAssetCommand, "taskId" | "versionId">): CanvasNodeData {
    const type = asset.kind === "AUDIO" ? CanvasNodeType.Audio : asset.kind === "VIDEO" ? CanvasNodeType.Video : CanvasNodeType.Image;
    const size = asset.kind === "AUDIO"
        ? audioSize
        : asset.kind === "VIDEO"
            ? fitCanvasAssetNodeSize(asset.width, asset.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT)
            : fitCanvasAssetNodeSize(asset.width, asset.height);
    return {
        id,
        type,
        title: asset.name,
        position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
        width: size.width,
        height: size.height,
        metadata: {
            ...canvasAssetMetadata(asset),
            ...(command?.taskId ? { taskId: command.taskId, status: "success" as const } : {}),
            ...(command?.versionId ? { versionId: command.versionId } : {}),
        },
    };
}
