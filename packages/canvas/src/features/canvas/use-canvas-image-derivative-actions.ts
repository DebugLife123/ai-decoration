import { useCallback, type MutableRefObject } from "react";
import type { CanvasNodeData } from "../../types/canvas";
import type { CanvasImageCropRect } from "../../components/canvas/canvas-node-crop-dialog";
import type { CanvasImageUpscaleParams } from "../../components/canvas/canvas-node-upscale-dialog";
import type { CanvasImageImporter } from "./contracts";
import { createCroppedImageNode } from "./crop-image";
import { createUpscaledImageNode } from "./upscale-image";

export type CanvasImageDerivativeKind = "crop" | "upscale";

export function useCanvasImageDerivativeActions({
    importImage,
    projectId,
    cropRequest,
    upscaleRequest,
    isSourcePresent,
    onCreated,
    onSourceMissing,
    onBusyChange,
    onError,
}: {
    importImage: CanvasImageImporter;
    projectId: string;
    cropRequest: MutableRefObject<symbol | null>;
    upscaleRequest: MutableRefObject<symbol | null>;
    isSourcePresent: (nodeId: string) => boolean;
    onCreated: (kind: CanvasImageDerivativeKind, source: CanvasNodeData, child: CanvasNodeData) => void;
    onSourceMissing: (kind: CanvasImageDerivativeKind) => void;
    onBusyChange: (kind: CanvasImageDerivativeKind, busy: boolean) => void;
    onError: (kind: CanvasImageDerivativeKind, error: unknown) => void;
}) {
    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (cropRequest.current) return;
        const request = Symbol();
        cropRequest.current = request;
        onBusyChange("crop", true);
        try {
            const child = await createCroppedImageNode(importImage, projectId, node, crop);
            if (cropRequest.current !== request) return;
            if (!isSourcePresent(node.id)) onSourceMissing("crop");
            else onCreated("crop", node, child);
        } catch (error) {
            if (cropRequest.current === request) onError("crop", error);
        } finally {
            if (cropRequest.current === request) {
                cropRequest.current = null;
                onBusyChange("crop", false);
            }
        }
    }, [cropRequest, importImage, isSourcePresent, onBusyChange, onCreated, onError, onSourceMissing, projectId]);

    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
        if (upscaleRequest.current) return;
        const request = Symbol();
        upscaleRequest.current = request;
        onBusyChange("upscale", true);
        try {
            const child = await createUpscaledImageNode(importImage, projectId, node, params);
            if (upscaleRequest.current !== request) return;
            if (!isSourcePresent(node.id)) onSourceMissing("upscale");
            else onCreated("upscale", node, child);
        } catch (error) {
            if (upscaleRequest.current === request) onError("upscale", error);
        } finally {
            if (upscaleRequest.current === request) {
                upscaleRequest.current = null;
                onBusyChange("upscale", false);
            }
        }
    }, [importImage, isSourcePresent, onBusyChange, onCreated, onError, onSourceMissing, projectId, upscaleRequest]);

    return { cropImageNode, upscaleImageNode };
}
