import { useCallback } from "react";
import type { ReferenceImage } from "../../types/image";
import { resolveCanvasGenerationOutcome } from "./generation-outcome";
import { generateCanvasImage, type CanvasImageGeneration, type CanvasImageSettings } from "./image-generation";
import { readCanvasReferenceImages, type CanvasMediaAdapter } from "./media";
import type { CanvasImportedImage } from "./contracts";
import type { CanvasNodeTaskSubmitter } from "./node-task-submission";

export function useCanvasImageEditExecution({
    projectId,
    media,
    generation,
    submitNodeTask,
    saveResultImage,
    startRequest,
    finishRequest,
    isCanceled,
    onSettled,
}: {
    projectId: string;
    media: CanvasMediaAdapter;
    generation: CanvasImageGeneration | undefined;
    submitNodeTask?: CanvasNodeTaskSubmitter;
    saveResultImage: (source: string | Blob, name: string, signal: AbortSignal) => Promise<CanvasImportedImage>;
    startRequest: (targetNodeId: string, originNodeId: string, runningId?: string) => AbortController;
    finishRequest: (targetNodeId: string, controller: AbortController) => void;
    isCanceled: (error: unknown) => boolean;
    onSettled: (targetNodeId: string) => void;
}) {
    return useCallback(async ({
        targetNodeId,
        originNodeId,
        prompt,
        editIntent = "edit",
        settings,
        references,
        sourceVersionId,
        fallbackMessage,
        onSuccess,
        onFailure,
    }: {
        targetNodeId: string;
        originNodeId: string;
        prompt: string;
        editIntent?: "edit" | "fill";
        settings: CanvasImageSettings;
        references: ReferenceImage[];
        sourceVersionId?: string;
        fallbackMessage: string;
        onSuccess: (image: CanvasImportedImage) => void;
        onFailure: (message: string) => void;
    }) => {
        const controller = startRequest(targetNodeId, originNodeId, targetNodeId);
        try {
            const referenceAssetIds = references.map(({ assetId }) => assetId).filter((assetId): assetId is string => Boolean(assetId));
            const sourceAssetId = references[0]?.assetId;
            if (submitNodeTask && sourceAssetId && referenceAssetIds.length === references.length) {
                await submitNodeTask({ projectId, type: "EDIT", editIntent, prompt, sourceAssetId, sourceVersionId, referenceAssetIds, image: settings }, targetNodeId, "图片编辑任务", controller.signal);
                return;
            }
            const resolvedReferences = await readCanvasReferenceImages(media, projectId, references, controller.signal);
            const image = await generateCanvasImage(generation, { projectId, operation: "edit", editIntent, prompt, settings, references: resolvedReferences }, controller.signal);
            const uploaded = await saveResultImage(image.dataUrl, `canvas-${targetNodeId}.png`, controller.signal);
            onSuccess(uploaded);
        } catch (error) {
            const outcome = resolveCanvasGenerationOutcome(error, controller.signal, fallbackMessage, isCanceled);
            if (outcome.kind === "failed") onFailure(outcome.message);
        } finally {
            finishRequest(targetNodeId, controller);
            if (!controller.signal.aborted) onSettled(targetNodeId);
        }
    }, [finishRequest, generation, isCanceled, media, onSettled, projectId, saveResultImage, startRequest, submitNodeTask]);
}
