import { useEffect } from "react";

export type CanvasWindowInteractionEvents = {
    onMouseMove: (event: MouseEvent) => void;
    onMouseUp: (event: MouseEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onPointerCancel: () => void;
    onBlur: () => void;
    onPointerMove: (event: PointerEvent) => void;
};

export function useCanvasWindowInteractionEvents({
    onMouseMove,
    onMouseUp,
    onPointerUp,
    onPointerCancel,
    onBlur,
    onPointerMove,
}: CanvasWindowInteractionEvents) {
    useEffect(() => {
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
        window.addEventListener("blur", onBlur);
        window.addEventListener("pointermove", onPointerMove);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerCancel);
            window.removeEventListener("blur", onBlur);
            window.removeEventListener("pointermove", onPointerMove);
        };
    }, [onBlur, onMouseMove, onMouseUp, onPointerCancel, onPointerMove, onPointerUp]);
}
