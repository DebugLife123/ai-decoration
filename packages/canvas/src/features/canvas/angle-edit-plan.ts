import type { ReferenceImage } from "../../types/image";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../../types/canvas";
import { createCanvasImageReference } from "./image-edit-reference";

export type CanvasAngleEditPlan = { node: CanvasNodeData; references: ReferenceImage[]; generationMetadata: Partial<CanvasNodeMetadata> };

export function createCanvasAngleEditPlan({ source, childId, title, prompt, buildGenerationMetadata, size }: {
    source: CanvasNodeData;
    childId: string;
    title: string;
    prompt: string;
    buildGenerationMetadata: (references: ReferenceImage[]) => Partial<CanvasNodeMetadata>;
    size: { width: number; height: number };
}): CanvasAngleEditPlan | null {
    const reference = createCanvasImageReference(source);
    if (!reference) return null;
    const references = [reference];
    const generationMetadata = buildGenerationMetadata(references);
    return {
        references,
        generationMetadata,
        node: {
            id: childId,
            type: CanvasNodeType.Image,
            title,
            position: { x: source.position.x + source.width + 96, y: source.position.y },
            width: size.width,
            height: size.height,
            metadata: { prompt, status: "loading", ...generationMetadata, sourceNodeId: source.id },
        },
    };
}
