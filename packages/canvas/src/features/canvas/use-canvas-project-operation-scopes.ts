import { useLayoutEffect, useRef } from "react";

export type CanvasAbortableOperation = { controller: AbortController };

export function useCanvasProjectOperationScopes(projectId: string) {
    const imageImport = useRef(new AbortController());
    const cropRequest = useRef<symbol | null>(null);
    const maskRequest = useRef<CanvasAbortableOperation | null>(null);
    const splitRequest = useRef<symbol | null>(null);
    const upscaleRequest = useRef<symbol | null>(null);

    useLayoutEffect(() => {
        imageImport.current = new AbortController();
        return () => {
            imageImport.current.abort();
            cropRequest.current = null;
            maskRequest.current?.controller.abort();
            maskRequest.current = null;
            splitRequest.current = null;
            upscaleRequest.current = null;
        };
    }, [projectId]);

    return { imageImport, cropRequest, maskRequest, splitRequest, upscaleRequest };
}
