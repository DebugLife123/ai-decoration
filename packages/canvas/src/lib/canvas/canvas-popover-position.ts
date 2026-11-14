export type CanvasPopoverPlacement = "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";

export function getCanvasPopoverPosition(
    anchor: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width">,
    placement: CanvasPopoverPlacement | undefined = "topLeft",
    viewport = { width: window.innerWidth, height: window.innerHeight },
) {
    const margin = 12;
    const gap = 8;
    const resolvedPlacement = placement || "topLeft";
    const width = Math.min(356, Math.max(0, viewport.width - margin * 2));
    const alignRight = resolvedPlacement.endsWith("Right");
    const alignCenter = resolvedPlacement === "top" || resolvedPlacement === "bottom";
    const preferredTop = resolvedPlacement.startsWith("top");
    const left = alignCenter ? anchor.left + anchor.width / 2 - width / 2 : alignRight ? anchor.right - width : anchor.left;
    const spaceAbove = Math.max(0, anchor.top - margin - gap);
    const spaceBelow = Math.max(0, viewport.height - anchor.bottom - margin - gap);
    const openAbove = preferredTop ? spaceAbove >= spaceBelow : spaceAbove > spaceBelow;

    return {
        position: "fixed" as const,
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(viewport.width - width - margin, left)),
        ...(openAbove
            ? { bottom: viewport.height - anchor.top + gap, maxHeight: spaceAbove }
            : { top: anchor.bottom + gap, maxHeight: spaceBelow }),
    };
}
