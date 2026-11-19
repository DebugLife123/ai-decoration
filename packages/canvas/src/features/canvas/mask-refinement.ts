export type CanvasMaskRefinementBounds = { x: number; y: number; width: number; height: number };

export type CanvasMaskRefinementRequest = {
    projectId: string;
    imageDataUrl: string;
    maskDataUrl: string;
    positiveMaskDataUrl: string;
    negativeMaskDataUrl: string;
};
export type CanvasMaskRefinementResult = {
    maskDataUrl: string;
    bounds?: CanvasMaskRefinementBounds;
};

/**
 * Refines a user-painted mask only. It must not generate or modify the source image.
 * The mask uses the same convention as image editing: transparent pixels are selected.
 */
export type CanvasMaskRefinement = {
    execute(request: CanvasMaskRefinementRequest, signal: AbortSignal): Promise<CanvasMaskRefinementResult>;
};
