import { nanoid } from "nanoid";
import { upscaleDataUrl, type ImageUpscaleParams } from "../../lib/canvas/canvas-image-data";
import { fitNodeSize } from "../../lib/canvas/canvas-node-size";
import { dataUrlToFile } from "../../lib/image-utils";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";
import { canvasAssetMetadata } from "./asset-import";
import type { CanvasImageImporter } from "./contracts";

export async function createUpscaledImageNode(importImage: CanvasImageImporter, projectId: string, source: CanvasNodeData, params: ImageUpscaleParams): Promise<CanvasNodeData> {
    if (!source.metadata?.content) throw new Error("源图片不存在");
    const dataUrl = await upscaleDataUrl(source.metadata.content, params);
    const file = dataUrlToFile({ id: source.id, name: `${source.title || "image"}-upscale.png`, type: "image/png", dataUrl });
    const asset = await importImage(projectId, file);
    if (asset.projectId !== projectId) throw new Error("放大结果不属于当前项目");
    return {
        id: nanoid(), type: CanvasNodeType.Image, title: "分辨率副本",
        position: { x: source.position.x + source.width + 96, y: source.position.y },
        ...fitNodeSize(asset.width, asset.height),
        metadata: { ...canvasAssetMetadata(asset), prompt: source.metadata.prompt },
    };
}
