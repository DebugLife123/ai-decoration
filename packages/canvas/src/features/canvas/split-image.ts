import { nanoid } from "nanoid";
import { splitDataUrl, type ImageSplitParams, type ImageSplitPiece } from "../../lib/canvas/canvas-image-data";
import { dataUrlToFile } from "../../lib/image-utils";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";
import { canvasAssetMetadata } from "./asset-import";
import type { CanvasImageImporter } from "./contracts";

export type CanvasSplitBatch = {
    projectId: string;
    source: CanvasNodeData;
    items: { piece: ImageSplitPiece; node?: CanvasNodeData; error?: string }[];
};

export async function prepareImageSplit(projectId: string, source: CanvasNodeData, params: ImageSplitParams): Promise<CanvasSplitBatch> {
    if (!source.metadata?.content) throw new Error("源图片不存在");
    const snapshot = structuredClone(source);
    const pieces = await splitDataUrl(snapshot.metadata!.content!, params);
    return { projectId, source: snapshot, items: pieces.map((piece) => ({ piece })) };
}

// Keep successful imports in the batch; manual retries save only failed pieces.
export async function saveImageSplit(importImage: CanvasImageImporter, batch: CanvasSplitBatch): Promise<CanvasSplitBatch> {
    const { source, projectId } = batch;
    const sourceWidth = Math.max(...batch.items.map(({ piece }) => piece.x + piece.width));
    const scale = source.width / sourceWidth;
    const items = await Promise.all(batch.items.map(async (item) => {
        if (item.node) return item;
        const { piece } = item;
        try {
            const title = `${source.title || "图片"} ${piece.row + 1}-${piece.column + 1}`;
            const file = dataUrlToFile({ id: source.id, name: `${title}.png`, type: "image/png", dataUrl: piece.dataUrl });
            const asset = await importImage(projectId, file);
            if (asset.projectId !== projectId) throw new Error("切图结果不属于当前项目");
            const width = piece.width * scale;
            const node: CanvasNodeData = {
                id: nanoid(), type: CanvasNodeType.Image, title,
                position: { x: source.position.x + source.width + 96 + piece.x * scale + piece.column * 16, y: source.position.y + piece.y * scale + piece.row * 16 },
                width, height: width * asset.height / asset.width,
                metadata: { ...canvasAssetMetadata(asset), prompt: source.metadata?.prompt },
            };
            return { piece, node };
        } catch (error) {
            return { piece, error: error instanceof Error ? error.message : "切图保存失败" };
        }
    }));
    return { ...batch, items };
}
