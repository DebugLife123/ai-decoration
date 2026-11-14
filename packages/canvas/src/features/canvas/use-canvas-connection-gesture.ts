import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ConnectionHandle, Position } from "../../types/canvas";
import { resolveCanvasConnectionDrop, resolveCanvasConnectionHover } from "./connection-gesture";
import type { CanvasConnectionDropTarget } from "./viewport-geometry";

export type CanvasConnectionCreateRequest = { connection: ConnectionHandle; position: Position };

export type CanvasConnectionGestureOptions = {
    connectingParamsRef: MutableRefObject<ConnectionHandle | null>;
    pendingConnectionCreateRef: MutableRefObject<CanvasConnectionCreateRequest | null>;
    getConnectionDropTarget: (clientX: number, clientY: number, current: ConnectionHandle) => CanvasConnectionDropTarget;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    setConnectionTargetNodeId: (nodeId: string | null) => void;
    setMouseWorld: (position: Position) => void;
    setPendingConnectionCreate: Dispatch<SetStateAction<CanvasConnectionCreateRequest | null>>;
    setConnecting: (connection: ConnectionHandle | null) => void;
    connectNodes: (connection: ConnectionHandle, targetNodeId: string) => void;
};

export function useCanvasConnectionGesture({
    connectingParamsRef,
    pendingConnectionCreateRef,
    getConnectionDropTarget,
    screenToCanvas,
    setConnectionTargetNodeId,
    setMouseWorld,
    setPendingConnectionCreate,
    setConnecting,
    connectNodes,
}: CanvasConnectionGestureOptions) {
    const onMouseMove = useCallback((event: MouseEvent) => {
        const current = connectingParamsRef.current;
        if (!current || pendingConnectionCreateRef.current) return false;

        const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, current);
        const hover = resolveCanvasConnectionHover(dropTarget, screenToCanvas(event.clientX, event.clientY));
        setConnectionTargetNodeId(hover.targetNodeId);
        setMouseWorld(hover.mouseWorld);
        return true;
    }, [connectingParamsRef, getConnectionDropTarget, pendingConnectionCreateRef, screenToCanvas, setConnectionTargetNodeId, setMouseWorld]);

    const onMouseUp = useCallback((event: MouseEvent) => {
        if (pendingConnectionCreateRef.current) return;
        const current = connectingParamsRef.current;
        if (!current) return;

        const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, current);
        const action = resolveCanvasConnectionDrop(dropTarget, screenToCanvas(event.clientX, event.clientY));
        if (action.type === "connect") {
            connectNodes(current, action.nodeId);
            setConnecting(null);
        } else if (action.type === "cancel") {
            setConnecting(null);
        } else {
            setMouseWorld(action.position);
            setPendingConnectionCreate({ connection: current, position: action.position });
        }
    }, [connectNodes, connectingParamsRef, getConnectionDropTarget, pendingConnectionCreateRef, screenToCanvas, setConnecting, setMouseWorld, setPendingConnectionCreate]);

    return { onMouseMove, onMouseUp };
}
