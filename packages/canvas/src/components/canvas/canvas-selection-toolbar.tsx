import { useCanvasTheme } from "../../features/canvas/canvas-host";
import type { CanvasTheme } from "../../lib/canvas-theme";
import type { ReactNode } from "react";
import { Group, LayoutGrid, Ungroup } from "lucide-react";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { getCanvasNodeBounds } from "../../features/canvas/selection-geometry";
import type { CanvasNodeData, ViewportTransform } from "../../types/canvas";

const SELECTION_PAD = 14;

export function CanvasSelectionToolbar({
    nodes,
    viewport,
    showToolbar,
    canGroup,
    canUngroup,
    onTidyLayout,
    onGroup,
    onUngroup,
}: {
    nodes: CanvasNodeData[];
    viewport: ViewportTransform;
    showToolbar: boolean;
    canGroup: boolean;
    canUngroup: boolean;
    onTidyLayout: () => void;
    onGroup: () => void;
    onUngroup: () => void;
}) {
    const { t } = useTranslation();
    const { theme } = useCanvasTheme();
    if (nodes.length < 2) return null;

    const bounds = getCanvasNodeBounds(nodes);
    const left = viewport.x + bounds.left * viewport.k - SELECTION_PAD;
    const top = viewport.y + bounds.top * viewport.k - SELECTION_PAD;
    const width = (bounds.right - bounds.left) * viewport.k + SELECTION_PAD * 2;
    const height = (bounds.bottom - bounds.top) * viewport.k + SELECTION_PAD * 2;
    const showActions = showToolbar;

    return (
        <>
            <svg className="pointer-events-none absolute z-[65] overflow-visible" style={{ left, top, width, height }}>
                <rect
                    x={1}
                    y={1}
                    width={Math.max(width - 2, 0)}
                    height={Math.max(height - 2, 0)}
                    rx={16}
                    ry={16}
                    fill={theme.canvas.selectionFill}
                    stroke={theme.canvas.selectionStroke}
                    strokeOpacity={0.55}
                    strokeWidth={1.5}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                />
            </svg>
            {showActions ? (
                <div
                    className="canvas-overlay-dock thin-scrollbar absolute z-[70] flex min-h-14 max-w-[min(92vw,560px)] -translate-x-1/2 -translate-y-full items-center gap-2 overflow-x-auto border p-2 text-[13px]"
                    style={{ left: left + width / 2, top: top - 8, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <SelectionAction title={t("canvas.nodeToolbar.tidyTitle")} label={t("canvas.nodeToolbar.tidy")} icon={<LayoutGrid className="size-4" />} theme={theme} onClick={onTidyLayout} />
                    {canGroup ? <SelectionAction title={t("canvas.nodeToolbar.groupTitle")} label={t("canvas.nodeToolbar.group")} icon={<Group className="size-4" />} theme={theme} onClick={onGroup} /> : null}
                    {canUngroup ? <SelectionAction title={t("canvas.nodeToolbar.ungroupTitle")} label={t("canvas.nodeToolbar.ungroup")} icon={<Ungroup className="size-4" />} theme={theme} onClick={onUngroup} /> : null}
                </div>
            ) : null}
        </>
    );
}

function SelectionAction({ title, label, icon, theme, onClick }: { title: string; label: string; icon: ReactNode; theme: CanvasTheme; onClick: () => void }) {
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2} color={theme.toolbar.panel} styles={{ root: { color: theme.node.text, boxShadow: "0 8px 24px rgba(15,23,42,.16)", fontSize: 13, fontWeight: 500 } }}>
            <button type="button" className="group relative flex h-11 min-w-11 items-center justify-center whitespace-nowrap px-1.5" style={{ color: theme.node.text }} onClick={onClick} aria-label={title}>
                <span className="flex h-10 items-center gap-2.5 rounded-xl px-3.5 transition" onMouseEnter={(event) => { event.currentTarget.style.background = theme.toolbar.itemHover; }} onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}>
                    {icon}
                    <span>{label}</span>
                </span>
            </button>
        </Tooltip>
    );
}
