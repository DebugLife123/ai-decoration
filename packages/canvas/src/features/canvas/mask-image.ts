import { nanoid } from "nanoid";
import { dataUrlToFile } from "../../lib/image-utils";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";
import { canvasAssetMetadata } from "./asset-import";
import type { CanvasImageImporter } from "./contracts";

export const maskOverlayColor = "#2563eb";
export const maskOverlayAlpha = 0.4;

export async function createMaskImageNode(importImage: CanvasImageImporter, projectId: string, source: CanvasNodeData, maskDataUrl: string, title: string, signal?: AbortSignal): Promise<CanvasNodeData> {
    if (!source.metadata?.content) throw new Error("源图片不存在");
    const file = dataUrlToFile({ id: source.id, name: "mask.png", type: "image/png", dataUrl: maskDataUrl });
    const asset = await importImage(projectId, file, signal);
    signal?.throwIfAborted();
    if (asset.projectId !== projectId) throw new Error("蒙版结果不属于当前项目");
    return {
        id: nanoid(), type: CanvasNodeType.Image, title,
        position: { x: source.position.x, y: source.position.y + source.height + 96 },
        width: source.width, height: source.width * asset.height / asset.width,
        metadata: canvasAssetMetadata(asset),
    };
}

// Preserve the existing blue-overlay reference format; this is not a binary edit mask.
export function buildMaskOverlay(image: HTMLImageElement, selectionCanvas: HTMLCanvasElement) {
    const canvas = document.createElement("canvas");
    canvas.width = selectionCanvas.width;
    canvas.height = selectionCanvas.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建蒙版合成画布");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const overlay = document.createElement("canvas");
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    const overlayContext = overlay.getContext("2d");
    if (!overlayContext) throw new Error("无法创建蒙版标注画布");
    overlayContext.drawImage(selectionCanvas, 0, 0);
    overlayContext.globalCompositeOperation = "source-in";
    overlayContext.fillStyle = maskOverlayColor;
    overlayContext.fillRect(0, 0, overlay.width, overlay.height);
    context.globalAlpha = maskOverlayAlpha;
    context.drawImage(overlay, 0, 0);
    return canvas.toDataURL("image/png");
}

export function buildMaskBinary(selectionCanvas: HTMLCanvasElement) {
    const canvas = document.createElement("canvas");
    canvas.width = selectionCanvas.width;
    canvas.height = selectionCanvas.height;
    const sourceContext = selectionCanvas.getContext("2d", { willReadFrequently: true });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("无法读取蒙版标注画布");
    if (!context) throw new Error("无法创建二值蒙版画布");
    const source = sourceContext.getImageData(0, 0, canvas.width, canvas.height).data;
    const output = context.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < source.length; index += 4) {
        const value = source[index + 3] > 0 ? 255 : 0;
        output.data[index] = value;
        output.data[index + 1] = value;
        output.data[index + 2] = value;
        output.data[index + 3] = 255;
    }
    context.putImageData(output, 0, 0);
    return canvas.toDataURL("image/png");
}
