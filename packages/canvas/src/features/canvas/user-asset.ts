import type { CanvasNodeData } from "../../types/canvas";
import { CanvasNodeType } from "../../types/canvas";
import { getDataUrlByteSize } from "../../lib/data-url";
import type { CanvasUserAsset } from "./canvas-host";

export function createCanvasUserAsset(node: CanvasNodeData, titles: { text: string; image: string; video: string }): CanvasUserAsset | null {
    const { metadata } = node;
    const title = metadata?.prompt?.slice(0, 24);
    if (node.type === CanvasNodeType.Text) {
        const content = metadata?.content?.trim();
        return content ? { kind: "text", title: title || titles.text, content, nodeId: node.id, prompt: metadata?.prompt } : null;
    }
    if (!metadata?.content) return null;
    if (node.type === CanvasNodeType.Video) {
        return { kind: "video", title: title || titles.video, url: metadata.content, storageKey: metadata.storageKey, width: node.width, height: node.height, bytes: metadata.bytes || 0, mimeType: metadata.mimeType || "video/mp4", nodeId: node.id, prompt: metadata.prompt };
    }
    if (node.type !== CanvasNodeType.Image) return null;
    const dataUrl = metadata.storageKey ? "" : metadata.content;
    return { kind: "image", title: title || titles.image, url: metadata.content, storageKey: metadata.storageKey, width: metadata.naturalWidth || node.width, height: metadata.naturalHeight || node.height, bytes: metadata.bytes || getDataUrlByteSize(dataUrl), mimeType: metadata.mimeType || "image/png", nodeId: node.id, prompt: metadata.prompt };
}
