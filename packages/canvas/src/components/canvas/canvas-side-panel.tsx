import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Alert, App, Empty, Input, Popconfirm, Select, Spin, Tag } from "antd";
import { Check, CheckCircle2, ChevronRight, Clock3, Download, Eye, FileText, Image as ImageIcon, ListChecks, Music2, Plus, RotateCcw, Search, Settings2, Square, Trash2, Type, Upload, Video, X, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";

import { canvasThemes, type CanvasTheme } from "../../lib/canvas-theme";
import { exportCanvasNodes } from "../../lib/canvas/canvas-export";
import { getNodeDefinition } from "../../lib/canvas/node-registry";
import { cn } from "../../lib/utils";
import type { CanvasAssetManager, CanvasManagedAsset } from "../../features/canvas/asset-manager";
import { useCanvasHost, useCanvasTheme } from "../../features/canvas/canvas-host";
import { CANVAS_SIDE_PANEL_MAX_WIDTH, CANVAS_SIDE_PANEL_MIN_WIDTH, CANVAS_SIDE_PANEL_MOTION_MS, useCanvasSidePanelStore } from "../../stores/use-canvas-side-panel-store";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";

import type { InsertAssetPayload } from "./asset-picker-modal";
import { CanvasTaskStatusPanel } from "./canvas-task-status-panel";

const PANEL_MOTION_SECONDS = CANVAS_SIDE_PANEL_MOTION_MS / 1000;
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

type PanelTab = "canvas" | "assets" | "prompts" | "tasks";

type Props = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onFocusNode: (nodeId: string) => void;
    onPreviewNode: (nodeId: string) => void;
    onInsertAsset: (payload: InsertAssetPayload) => void;
    onRetryTask: (node: CanvasNodeData, imageId?: string) => void;
    onExportResults: () => void;
    exportingResults: boolean;
};

const NODE_TYPE_ICON: Record<string, typeof Square> = {
    [CanvasNodeType.Image]: ImageIcon,
    [CanvasNodeType.Video]: Video,
    [CanvasNodeType.Audio]: Music2,
    [CanvasNodeType.Text]: Type,
    [CanvasNodeType.Config]: Settings2,
    [CanvasNodeType.Group]: Square,
};

const STATUS_COLOR: Record<string, string> = {
    success: "#22c55e",
    loading: "#f59e0b",
    error: "#ef4444",
    idle: "transparent",
};

export function CanvasSidePanel({ nodes, selectedNodeIds, onFocusNode, onPreviewNode, onInsertAsset, onRetryTask, onExportResults, exportingResults }: Props) {
    const { t } = useTranslation();
    const { assetManager, renderPromptLibrary, projectId, taskRecords } = useCanvasHost();
    const { theme } = useCanvasTheme();
    const projectTaskRecords = useMemo(() => taskRecords?.filter((record) => record.task.projectId === projectId), [projectId, taskRecords]);
    const [tab, setTab] = useState<PanelTab>("canvas");
    const width = useCanvasSidePanelStore((state) => state.width);
    const panelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const panelMounted = useCanvasSidePanelStore((state) => state.panelMounted);
    const panelClosing = useCanvasSidePanelStore((state) => state.panelClosing);
    const setWidth = useCanvasSidePanelStore((state) => state.setWidth);
    const [resizing, setResizing] = useState(false);

    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        let nextWidth = startWidth;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH, Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH, startWidth + moveEvent.clientX - startX));
            setWidth(nextWidth);
        };
        const onUp = () => {
            localStorage.setItem("canvas-side-panel-width", String(nextWidth));
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setResizing(false);
        };
        setResizing(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    if (!panelMounted) return null;

    return (
        <motion.div
            className="relative z-[60] flex h-full shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelOpen ? width + 1 : 0, opacity: panelOpen ? 1 : 0 }}
            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: PANEL_EASE }}
            style={{ overflow: "clip", pointerEvents: panelClosing ? "none" : undefined }}
        >
            <motion.aside
                className="relative flex h-full shrink-0 flex-col overflow-hidden border-r"
                initial={{ x: -48 }}
                animate={{ x: panelClosing ? -28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: PANEL_EASE }}
                style={{ width, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                data-canvas-no-zoom
            >
                <div className="flex items-center gap-3 px-4 pt-4">
                    <TabButton label={t("canvas.sidePanel.canvas")} active={tab === "canvas"} theme={theme} onClick={() => setTab("canvas")} />
                    {assetManager ? <TabButton label={t("canvas.sidePanel.assets")} active={tab === "assets"} theme={theme} onClick={() => setTab("assets")} /> : null}
                    {renderPromptLibrary ? <TabButton label={t("canvas.sidePanel.prompts")} active={tab === "prompts"} theme={theme} onClick={() => setTab("prompts")} /> : null}
                    <TabButton label={t("canvas.sidePanel.tasks")} active={tab === "tasks"} theme={theme} onClick={() => setTab("tasks")} />
                </div>
                <div className="mt-3 min-h-0 flex-1 overflow-hidden">
                    {tab === "canvas" ? (
                        <CanvasNodesTab nodes={nodes} selectedNodeIds={selectedNodeIds} onFocusNode={onFocusNode} onPreviewNode={onPreviewNode} theme={theme} />
                    ) : tab === "assets" ? (
                        assetManager ? <CanvasAssetsTab manager={assetManager} onInsert={onInsertAsset} theme={theme} /> : null
                    ) : tab === "prompts" ? (
                        renderPromptLibrary?.({ onInsert: onInsertAsset, theme })
                    ) : (
                        <CanvasTaskStatusPanel nodes={nodes} taskRecords={projectTaskRecords} onFocusNode={onFocusNode} onRetry={onRetryTask} onExportResults={onExportResults} exporting={exportingResults} />
                    )}
                </div>
                <button type="button" className="absolute inset-y-0 right-0 z-40 w-4 translate-x-1/2 cursor-col-resize" onPointerDown={startResize} aria-label={t("canvas.sidePanel.resize")} />
            </motion.aside>
        </motion.div>
    );
}

function TabButton({ label, active, theme, onClick }: { label: string; active: boolean; theme: CanvasTheme; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="relative shrink-0 pb-1.5 text-sm font-semibold transition-opacity" style={{ color: theme.node.text, opacity: active ? 1 : 0.45 }}>
            {label}
            {active ? <motion.span layoutId="sidePanelTabIndicator" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: theme.toolbar.activeText }} transition={{ type: "spring", stiffness: 500, damping: 34 }} /> : null}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Canvas tab: list nodes and center, zoom, and select the clicked node.
// ---------------------------------------------------------------------------

const NODE_FILTER_VALUES = ["all", CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Text, CanvasNodeType.Audio, CanvasNodeType.Config, CanvasNodeType.Group];

function nodePreviewText(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return getNodeDefinition(node.type)?.title || node.type;
}

function CanvasNodesTab({ nodes, selectedNodeIds, onFocusNode, onPreviewNode, theme }: { nodes: CanvasNodeData[]; selectedNodeIds: Set<string>; onFocusNode: (nodeId: string) => void; onPreviewNode: (nodeId: string) => void; theme: CanvasTheme }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const { projectId, media } = useCanvasHost();
    const [keyword, setKeyword] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [selectMode, setSelectMode] = useState(false);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return nodes.filter((node) => (typeFilter === "all" || node.type === typeFilter) && (!query || [node.title, node.metadata?.content, node.metadata?.prompt].filter(Boolean).join(" ").toLowerCase().includes(query)));
    }, [nodes, keyword, typeFilter]);
    const treeRows = useMemo(() => {
        const filteredIds = new Set(filtered.map((node) => node.id));
        const groups = new Set(nodes.filter((node) => node.type === CanvasNodeType.Group).map((node) => node.id));
        const children = new Map<string, CanvasNodeData[]>();
        filtered.forEach((node) => {
            const groupId = node.metadata?.groupId;
            if (groupId && groups.has(groupId)) children.set(groupId, [...(children.get(groupId) || []), node]);
        });
        return nodes.flatMap((node) => {
            if (node.metadata?.groupId && groups.has(node.metadata.groupId)) return [];
            if (node.type !== CanvasNodeType.Group) return filteredIds.has(node.id) ? [{ node, depth: 0, hasChildren: false }] : [];
            const groupChildren = children.get(node.id) || [];
            if (!filteredIds.has(node.id) && !groupChildren.length) return [];
            return [{ node, depth: 0, hasChildren: groupChildren.length > 0 }, ...(collapsedGroups.has(node.id) ? [] : groupChildren.map((child) => ({ node: child, depth: 1, hasChildren: false })))];
        });
    }, [collapsedGroups, filtered, nodes]);

    const exitSelect = () => {
        setSelectMode(false);
        setChecked(new Set());
    };
    const toggleChecked = (id: string) =>
        setChecked((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    const allChecked = filtered.length > 0 && filtered.every((node) => checked.has(node.id));
    const toggleAll = () => setChecked(allChecked ? new Set() : new Set(filtered.map((node) => node.id)));

    const handleExport = async () => {
        const targets = nodes.filter((node) => checked.has(node.id));
        if (!targets.length) return;
        setExporting(true);
        const hide = message.loading(t("canvas.sidePanel.exporting"), 0);
        try {
            await exportCanvasNodes(targets, t("canvas.sidePanel.exportName", { count: targets.length }), projectId, (id, reference) => media.readMedia(id, reference, new AbortController().signal));
            message.success(t("canvas.sidePanel.exported", { count: targets.length }));
            exitSelect();
        } catch (error) {
            console.error(error);
            message.error(t("canvas.sidePanel.exportFailed"));
        } finally {
            hide();
            setExporting(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="px-4 pb-3 pt-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium opacity-60">{t("canvas.sidePanel.elements")}</span>
                    {filtered.length ? <span className="text-xs tabular-nums opacity-35">{filtered.length}</span> : null}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                        className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                        style={selectMode ? { color: theme.toolbar.activeText, opacity: 1, background: theme.toolbar.activeBg } : undefined}
                    >
                        <ListChecks className="size-3.5 shrink-0" />
                        <span className="truncate">{selectMode ? t("common.cancel") : t("canvas.sidePanel.select")}</span>
                    </button>
                    {selectMode ? null : <Select size="small" variant="borderless" className="min-w-0 flex-1" value={typeFilter} onChange={setTypeFilter} options={NODE_FILTER_VALUES.map((value) => ({ value, label: value === "all" ? t("common.all") : t(`canvas.sidePanel.filter.${value}`) }))} />}
                </div>
            </div>
            <div className="px-4 pb-3">
                <Input size="small" allowClear prefix={<Search className="size-3.5 text-stone-400" />} placeholder={t("canvas.sidePanel.searchNodes")} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {treeRows.length ? (
                    <div className="space-y-1.5">
                        {treeRows.map(({ node, depth, hasChildren }) => {
                            const Icon = NODE_TYPE_ICON[node.type] || FileText;
                            const isImage = node.type === CanvasNodeType.Image && node.metadata?.content;
                            const isChecked = checked.has(node.id);
                            const active = selectMode ? isChecked : selectedNodeIds.has(node.id);
                            return (
                                <div key={node.id} className={cn("group relative flex items-center rounded-lg transition", depth && "ml-5", active ? "" : "hover:bg-black/5 dark:hover:bg-white/5")} style={active ? { background: theme.toolbar.activeBg } : undefined}>
                                    {depth ? <span className="pointer-events-none absolute -left-3 top-[calc(-50%-0.4rem)] h-[calc(100%+0.4rem)] w-3 rounded-bl-md border-b border-l opacity-45" style={{ borderColor: theme.node.stroke }} /> : null}
                                    {node.type === CanvasNodeType.Group && hasChildren ? (
                                        <button type="button" onClick={() => setCollapsedGroups((prev) => (prev.has(node.id) ? new Set([...prev].filter((id) => id !== node.id)) : new Set(prev).add(node.id)))} className="ml-1 grid size-6 shrink-0 place-items-center opacity-55 transition hover:opacity-100" aria-label={node.title}>
                                            <ChevronRight className={cn("size-3.5 transition-transform", !collapsedGroups.has(node.id) && "rotate-90")} />
                                        </button>
                                    ) : null}
                                    <button type="button" onClick={() => (selectMode ? toggleChecked(node.id) : onFocusNode(node.id))} className={cn("flex min-w-0 flex-1 items-center gap-3 py-2 pr-2 text-left", node.type === CanvasNodeType.Group && hasChildren ? "pl-0" : "pl-2")} title={selectMode ? undefined : t("canvas.sidePanel.focusNode")}>
                                        {selectMode ? <CheckMark checked={isChecked} theme={theme} /> : null}
                                        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md">
                                            {isImage ? <img src={node.metadata!.content} alt={node.title} className="size-full object-cover" /> : <Icon className="size-5 opacity-60" />}
                                        </span>
                                        <span className="min-w-0 flex-1 space-y-0.5">
                                            <span className="block truncate text-sm font-medium leading-snug">{node.title || getNodeDefinition(node.type)?.title || t("canvas.node.untitled")}</span>
                                            <span className="block truncate text-xs leading-snug opacity-50">{nodePreviewText(node)}</span>
                                        </span>
                                        {node.metadata?.status && node.metadata.status !== "idle" ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[node.metadata.status] || "transparent" }} /> : null}
                                    </button>
                                    {selectMode || !isImage ? null : (
                                        <div className="flex shrink-0 flex-col items-center gap-0.5 pr-1.5">
                                            <button type="button" onClick={() => onPreviewNode(node.id)} className="grid size-7 place-items-center rounded-md opacity-55 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10" aria-label={t("canvas.sidePanel.preview")} title={t("canvas.sidePanel.preview")}>
                                                <Eye className="size-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="pt-16 text-center text-sm opacity-40">{t("canvas.sidePanel.noNodes")}</div>
                )}
            </div>
            {selectMode ? (
                <div className="flex items-center gap-2 border-t px-3 py-2.5" style={{ borderColor: theme.toolbar.border }}>
                    <button type="button" onClick={toggleAll} className="rounded-md px-2 py-1 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10">
                        {allChecked ? t("canvas.sidePanel.clearAll") : t("workbench.selectAll")}
                    </button>
                    <span className="text-xs opacity-45">{t("canvas.sidePanel.selected", { count: checked.size })}</span>
                    <button
                        type="button"
                        onClick={() => void handleExport()}
                        disabled={!checked.size || exporting}
                        className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
                        style={{ color: theme.node.text }}
                    >
                        <Download className="size-3.5" />
                        {t("canvas.exportSelected")}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function CheckMark({ checked, theme }: { checked: boolean; theme: CanvasTheme }) {
    return (
        <span className="grid size-4 shrink-0 place-items-center rounded border transition" style={{ borderColor: checked ? theme.toolbar.activeText : theme.node.stroke, background: checked ? theme.toolbar.activeText : "transparent" }}>
            {checked ? <Check className="size-3 text-white" /> : null}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Assets tab: collapsible type groups, tag filtering, and click-to-insert.
// ---------------------------------------------------------------------------

const ASSET_GROUPS: { kind: InsertAssetPayload["kind"]; icon: typeof Square }[] = [
    { kind: "image", icon: ImageIcon },
    { kind: "video", icon: Video },
    { kind: "text", icon: FileText },
];

const DESIGN_MATERIAL_CATEGORIES = [
    { value: "户型图", key: "floorPlan" },
    { value: "房间照片", key: "roomPhoto" },
    { value: "参考图", key: "reference" },
    { value: "蒙版", key: "mask" },
] as const;
type DesignMaterialCategory = (typeof DESIGN_MATERIAL_CATEGORIES)[number]["value"];
type UploadItemStatus = "queued" | "uploading" | "success" | "error";
type UploadItem = { id: string; file: File; category: DesignMaterialCategory; status: UploadItemStatus; error?: string };

function materialCategoryLabel(category: string, t: (key: string) => string) {
    const item = DESIGN_MATERIAL_CATEGORIES.find(({ value }) => value === category);
    return item ? t(`canvas.sidePanel.materialCategories.${item.key}`) : category;
}

const CanvasAssetsTab = memo(function CanvasAssetsTab({ manager, onInsert, theme }: { manager: CanvasAssetManager; onInsert: (payload: InsertAssetPayload) => void; theme: CanvasTheme }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [result, setResult] = useState<{ manager: CanvasAssetManager; items: CanvasManagedAsset[]; loading: boolean }>();
    const [loadError, setLoadError] = useState("");
    const [revision, setRevision] = useState(0);
    useEffect(() => manager.subscribe?.(() => setRevision((value) => value + 1)), [manager]);
    useEffect(() => {
        let active = true;
        setLoadError("");
        void manager.list().then((next) => {
            if (active) setResult({ manager, ...next });
        }).catch((error: unknown) => {
            if (active) setLoadError(error instanceof Error ? error.message : "素材加载失败");
        });
        return () => { active = false; };
    }, [manager, revision]);
    const assets = result?.manager === manager ? result.items : [];
    const loading = result?.manager !== manager || result.loading;
    const [keyword, setKeyword] = useState("");
    const [tagFilter, setTagFilter] = useState<string>("all");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [uploadCategory, setUploadCategory] = useState<DesignMaterialCategory>("参考图");
    const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const allTags = useMemo(() => Array.from(new Set(assets.flatMap((asset) => asset.tags || []))).slice(0, 20), [assets]);
    const allCategories = useMemo(() => DESIGN_MATERIAL_CATEGORIES.filter(({ value }) => assets.some((asset) => asset.category === value)), [assets]);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets.filter((asset) => (tagFilter === "all" || (asset.tags || []).includes(tagFilter)) && (categoryFilter === "all" || asset.category === categoryFilter) && (!query || [asset.title, asset.category, ...(asset.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(query)));
    }, [assets, categoryFilter, keyword, tagFilter]);

    const groups = useMemo(() => ASSET_GROUPS.map((group) => ({ ...group, items: filtered.filter((asset) => asset.payload.kind === group.kind) })).filter((group) => group.items.length > 0), [filtered]);

    const updateUploadItem = (id: string, patch: Partial<UploadItem>) => {
        setUploadQueue((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    };

    const uploadSingleFile = async (item: UploadItem) => {
        updateUploadItem(item.id, { status: "uploading", error: undefined });
        try {
            await manager.add(item.file, item.category);
            setRevision((value) => value + 1);
            updateUploadItem(item.id, { status: "success" });
            return true;
        } catch (error) {
            console.error(error);
            updateUploadItem(item.id, { status: "error", error: error instanceof Error ? error.message : t("canvas.sidePanel.addFailed") });
            return false;
        }
    };

    const handleFiles = async (fileList: FileList | null) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        const items = files.map((file) => ({ id: nanoid(), file, category: uploadCategory, status: "queued" as const }));
        setUploadQueue((current) => [...items, ...current]);
        let added = 0;
        for (const item of items) if (await uploadSingleFile(item)) added += 1;
        if (added) message.success(t("canvas.sidePanel.addedAssets", { count: added }));
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const uploading = uploadQueue.some((item) => item.status === "queued" || item.status === "uploading");
    const removeAsset = async (id: string) => {
        try {
            await manager.remove(id);
            setRevision((value) => value + 1);
            message.success(t("canvas.sidePanel.assetRemoved"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材移除失败");
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-3 pb-2 pt-1">
                <Input size="small" allowClear prefix={<Search className="size-3.5 text-stone-400" />} placeholder={t("canvas.sidePanel.searchAssets")} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                <Select size="small" value={uploadCategory} options={DESIGN_MATERIAL_CATEGORIES.map(({ value }) => ({ label: materialCategoryLabel(value, t), value }))} onChange={setUploadCategory} aria-label={t("canvas.sidePanel.materialCategory")} className="w-24 shrink-0" />
                <button
                    type="button"
                    disabled={uploading || loading || !!loadError}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                    style={{ color: theme.node.text }}
                    aria-label={t("canvas.sidePanel.add")}
                >
                    <Upload className="size-3.5" />
                    {t("canvas.sidePanel.add")}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
            </div>
            {uploadQueue.length ? (
                <section className="mx-3 mb-2 rounded-lg border px-2.5 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }} aria-live="polite" aria-busy={uploading}>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold" style={{ color: theme.node.text }}>
                        <span>{t("canvas.sidePanel.uploadQueue", { count: uploadQueue.length })}</span>
                        {!uploading ? <button type="button" className="grid size-7 place-items-center rounded-md transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 dark:hover:bg-white/10" onClick={() => setUploadQueue([])} aria-label={t("canvas.sidePanel.clearUploadQueue")}><X className="size-3.5" /></button> : null}
                    </div>
                    <ul className="thin-scrollbar mt-1.5 max-h-36 space-y-1 overflow-y-auto">
                        {uploadQueue.map((item) => (
                            <li key={item.id} className="flex min-w-0 items-center gap-1.5 text-[11px]" title={item.error || item.file.name}>
                                {item.status === "uploading" ? <Spin size="small" /> : item.status === "success" ? <CheckCircle2 className="size-3.5 shrink-0 text-green-600" /> : item.status === "error" ? <XCircle className="size-3.5 shrink-0 text-red-500" /> : <Clock3 className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />}
                                <span className="min-w-0 flex-1 truncate" style={{ color: item.status === "error" ? "#dc2626" : theme.node.muted }}>{item.file.name}</span>
                                <span className="shrink-0" style={{ color: item.status === "error" ? "#dc2626" : theme.node.faint }}>{t(`canvas.sidePanel.uploadStatus.${item.status}`)}</span>
                                {item.status === "error" ? <button type="button" className="flex min-h-7 shrink-0 items-center gap-0.5 rounded px-1 py-0.5 font-medium transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 dark:hover:bg-white/10" onClick={() => void uploadSingleFile(item)} style={{ color: theme.node.text }}><RotateCcw className="size-3" />{t("canvas.sidePanel.retryUpload")}</button> : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
            {allCategories.length ? (
                <div className="flex flex-wrap gap-1.5 px-3 pb-2" aria-label={t("canvas.sidePanel.materialCategoryFilter")}>
                    <Tag.CheckableTag checked={categoryFilter === "all"} className={cn("prompt-filter-tag", categoryFilter === "all" && "is-active")} onChange={() => setCategoryFilter("all")}>{t("common.all")}</Tag.CheckableTag>
                    {allCategories.map(({ value }) => <Tag.CheckableTag key={value} checked={categoryFilter === value} className={cn("prompt-filter-tag", categoryFilter === value && "is-active")} onChange={() => setCategoryFilter((current) => current === value ? "all" : value)}>{materialCategoryLabel(value, t)}</Tag.CheckableTag>)}
                </div>
            ) : null}
            {allTags.length ? (
                <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                    <Tag.CheckableTag checked={tagFilter === "all"} className={cn("prompt-filter-tag", tagFilter === "all" && "is-active")} onChange={() => setTagFilter("all")}>
                        {t("common.all")}
                    </Tag.CheckableTag>
                    {allTags.map((tag) => (
                        <Tag.CheckableTag key={tag} checked={tagFilter === tag} className={cn("prompt-filter-tag", tagFilter === tag && "is-active")} onChange={() => setTagFilter((prev) => (prev === tag ? "all" : tag))}>
                            {tag}
                        </Tag.CheckableTag>
                    ))}
                </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {loadError ? (
                    <Alert type="error" showIcon title={loadError} action={<button type="button" className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setRevision((value) => value + 1)}><RotateCcw className="size-3.5" />{t("canvas.sidePanel.retryUpload")}</button>} />
                ) : loading ? (
                    <div className="flex justify-center py-12" role="status" aria-label="素材加载中"><Spin /></div>
                ) : groups.length ? (
                    <div className="space-y-1">
                        {groups.map((group) => {
                            const isCollapsed = collapsed[group.kind];
                            return (
                                <div key={group.kind}>
                                    <button
                                        type="button"
                                        onClick={() => setCollapsed((prev) => ({ ...prev, [group.kind]: !prev[group.kind] }))}
                                        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold opacity-75 transition hover:opacity-100"
                                    >
                                        <ChevronRight className={cn("size-3.5 transition-transform", !isCollapsed && "rotate-90")} />
                                        <group.icon className="size-3.5" />
                                        <span>{t(`assets.kinds.${group.kind}`)}</span>
                                        <span className="opacity-50">{group.items.length}</span>
                                    </button>
                                    {isCollapsed ? null : (
                                        <div className="grid grid-cols-2 gap-2 px-1 pb-2 pt-1">
                                            {group.items.map((asset) => (
                                                <AssetCard key={asset.id} asset={asset} theme={theme} onInsert={() => onInsert(asset.payload)} onRemove={() => removeAsset(asset.id)} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.sidePanel.noAssets")} className="pt-16" />
                )}
            </div>
        </div>
    );
});

function AssetCard({ asset, theme, onInsert, onRemove }: { asset: CanvasManagedAsset; theme: CanvasTheme; onInsert: () => void; onRemove: () => Promise<void> }) {
    const { t } = useTranslation();
    return (
        <div className="group relative aspect-square overflow-hidden rounded-xl border transition duration-200 hover:-translate-y-0.5 hover:shadow-lg" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            <AssetCover asset={asset} />
            {asset.category ? <span className="absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] truncate rounded px-1.5 py-0.5 text-[10px]" style={{ background: theme.toolbar.panel, color: theme.node.text }}>{materialCategoryLabel(asset.category, t)}</span> : null}
            <div className="absolute inset-0 flex items-center justify-center gap-2.5 opacity-0 transition duration-200 group-hover:opacity-100">
                <button
                    type="button"
                    onClick={onInsert}
                    className="grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-stone-900 dark:bg-black/60 dark:text-stone-100 dark:hover:bg-black/80"
                    aria-label={t("canvas.sidePanel.inserted")}
                >
                    <Plus className="size-4" />
                </button>
                <Popconfirm title={t("canvas.sidePanel.removeAssetTitle")} okText={t("canvas.sidePanel.remove")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onConfirm={onRemove}>
                    <button
                        type="button"
                        className="grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-red-500 dark:bg-black/60 dark:text-stone-100 dark:hover:bg-black/80 dark:hover:text-red-400"
                        aria-label={t("canvas.sidePanel.removeAsset")}
                    >
                        <Trash2 className="size-4" />
                    </button>
                </Popconfirm>
            </div>
        </div>
    );
}

function AssetCover({ asset }: { asset: CanvasManagedAsset }) {
    if (asset.payload.kind === "text") return <div className="size-full overflow-hidden whitespace-pre-wrap break-words p-2.5 text-[11px] leading-snug opacity-80">{asset.payload.content}</div>;
    if (asset.payload.kind === "video") {
        if (asset.cover) return <img src={asset.cover} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />;
        return <video src={`${asset.payload.url}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />;
    }
    return asset.payload.kind === "image" ? <img src={asset.cover || asset.payload.dataUrl} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" /> : null;
}

