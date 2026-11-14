import { nanoid } from "nanoid";
import { cropDataUrl, type ImageCropRect } from "../../lib/canvas/canvas-image-data";
import { dataUrlToFile } from "../../lib/image-utils";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";
import { canvasAssetMetadata } from "./asset-import";
import type { CanvasImageImporter } from "./contracts";

export async function createCroppedImageNode(importImage: CanvasImageImporter, projectId: string, source: CanvasNodeData, crop: ImageCropRect): Promise<CanvasNodeData> {
    if (!source.metadata?.content) throw new Error("源图片不存在");
    const dataUrl = await cropDataUrl(source.metadata.content, crop);
    const file = dataUrlToFile({ id: source.id, name: `${source.title || "image"}-crop.png`, type: "image/png", dataUrl });
    const asset = await importImage(projectId, file);
    if (asset.projectId !== projectId) throw new Error("裁剪结果不属于当前项目");
    const width = Math.min(source.width, Math.max(220, asset.width));
    return {
        id: nanoid(),
        type: CanvasNodeType.Image,
        title: "裁剪图片",
        position: { x: source.position.x + source.width + 96, y: source.position.y },
        width,
        height: width * (asset.height / asset.width),
        metadata: { ...canvasAssetMetadata(asset), prompt: source.metadata.prompt },
    };
}
