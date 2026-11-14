import type { CanvasConnection, CanvasNodeData } from "../../types/canvas";
import type { CanvasImportedImage } from "./contracts";
import type { CanvasGenerationConfig } from "./generation-preferences";
import { generateCanvasImage, type CanvasImageGeneration } from "./image-generation";
import { buildNodeGenerationContext, hydrateNodeGenerationContext } from "../../components/canvas/canvas-node-generation";
import type { CanvasMediaAdapter } from "./media";

export async function executeCanvasImageWriteback({
    projectId,
    nodeId,
    scene,
    promptPrefix,
    nodes,
    connections,
    settings,
    media,
    generation,
    saveResultImage,
    signal,
}: {
    projectId: string;
    nodeId: string;
    scene: string;
    promptPrefix?: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    settings: CanvasGenerationConfig;
    media: CanvasMediaAdapter;
    generation: CanvasImageGeneration | undefined;
    saveResultImage: (source: string | Blob, name: string, signal: AbortSignal) => Promise<CanvasImportedImage>;
    signal: AbortSignal;
}): Promise<CanvasImportedImage> {
    const context = await hydrateNodeGenerationContext(
        buildNodeGenerationContext(nodeId, nodes, connections, `${promptPrefix || ""}${scene}`),
        media,
        projectId,
        signal,
    );
    const image = await generateCanvasImage(generation, {
        projectId,
        operation: context.referenceImages.length ? "edit" : "generate",
        prompt: context.prompt,
        settings,
        references: context.referenceImages,
    }, signal);
    return saveResultImage(image.dataUrl, `canvas-${nodeId}.png`, signal);
}
