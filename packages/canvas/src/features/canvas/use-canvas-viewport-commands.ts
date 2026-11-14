import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { CanvasNodeData, ContextMenuState, ViewportTransform } from "../../types/canvas";
import { getCanvasFitViewport, getCanvasNodeFocusViewport, getCanvasZoomViewport } from "./viewport-commands";

export type CanvasViewportCommandsOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    viewportRef: MutableRefObject<ViewportTransform>;
    width: number;
    height: number;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

export function useCanvasViewportCommands({ nodesRef, viewportRef, width, height, setViewport, setSelectedNodeIds, setSelectedConnectionId, setContextMenu }: CanvasViewportCommandsOptions) {
    const focusAnimRef = useRef<number | null>(null);

    const closeContextMenu = useCallback(() => setContextMenu(null), [setContextMenu]);

    const resetViewport = useCallback(() => {
        setViewport({ x: width / 2, y: height / 2, k: 1 });
        closeContextMenu();
    }, [closeContextMenu, height, setViewport, width]);

    const fitCanvasToNodes = useCallback(() => {
        setViewport(getCanvasFitViewport(nodesRef.current, width, height));
        closeContextMenu();
    }, [closeContextMenu, height, nodesRef, setViewport, width]);

    const focusNode = useCallback((nodeId: string) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node) return;

        const target = getCanvasNodeFocusViewport(node, width, height);
        setSelectedNodeIds(new Set([nodeId]));
        setSelectedConnectionId(null);
        closeContextMenu();

        if (focusAnimRef.current != null) cancelAnimationFrame(focusAnimRef.current);
        const start = { ...viewportRef.current };
        const duration = 450;
        const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
        let startTime: number | null = null;
        const step = (now: number) => {
            if (startTime === null) startTime = now;
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = easeOutCubic(progress);
            setViewport({ x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased, k: start.k + (target.k - start.k) * eased });
            focusAnimRef.current = progress < 1 ? requestAnimationFrame(step) : null;
        };
        focusAnimRef.current = requestAnimationFrame(step);
    }, [closeContextMenu, height, nodesRef, setSelectedConnectionId, setSelectedNodeIds, setViewport, viewportRef, width]);

    const cancelFocusAnimation = useCallback(() => {
        if (focusAnimRef.current == null) return;
        cancelAnimationFrame(focusAnimRef.current);
        focusAnimRef.current = null;
    }, []);

    useEffect(() => () => {
        cancelFocusAnimation();
    }, [cancelFocusAnimation]);

    const setZoomScale = useCallback((scale: number) => {
        setViewport((previous) => getCanvasZoomViewport(previous, scale, width, height));
        closeContextMenu();
    }, [closeContextMenu, height, setViewport, width]);

    return { cancelFocusAnimation, fitCanvasToNodes, focusNode, resetViewport, setZoomScale };
}
