import type { ReferenceImage } from "../../types/image";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../../types/canvas";
import { createCanvasImageReference } from "./image-edit-reference";

export type CanvasMaskEditPlan = { node: CanvasNodeData; references: ReferenceImage[]; generationMetadata: Partial<CanvasNodeMetadata> };

export function createCanvasMaskEditPlan({ source, mask, childId, title, prompt, buildGenerationMetadata, generate }: {
    source: CanvasNodeData;
    mask: CanvasNodeData;
    childId: string;
    title: string;
    prompt: string;
    buildGenerationMetadata: (references: ReferenceImage[]) => Partial<CanvasNodeMetadata>;
    generate: boolean;
}): CanvasMaskEditPlan | null {
    const sourceReference = createCanvasImageReference(source);
    const maskReference = createCanvasImageReference(mask, "mask.png");
    if (!sourceReference || !maskReference) return null;
    const references: ReferenceImage[] = [sourceReference, maskReference];
    const generationMetadata = generate ? buildGenerationMetadata(references) : {};
    return {
        references,
        generationMetadata,
        node: {
            id: childId,
            type: CanvasNodeType.Image,
            title,
            position: { x: source.position.x + source.width + 96, y: source.position.y },
            width: source.width,
            height: source.height,
            metadata: generate ? { prompt, status: "loading", ...generationMetadata, sourceNodeId: source.id } : { prompt },
        },
    };
}
