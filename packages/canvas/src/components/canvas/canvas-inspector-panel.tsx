import { useMemo } from "react";
import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Music2, Pencil, Settings2, Square, Type, Upload, Video } from "lucide-react";

import { useCanvasHost, useCanvasTheme } from "../../features/canvas/canvas-host";
import { useCanvasSidePanelStore } from "../../stores/use-canvas-side-panel-store";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";

type Props = {
    node?: CanvasNodeData;
    onTitleChange: (nodeId: string, title: string) => void;
    onOpenSettings: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
};

const nodeTypeLabel: Record<string, string> = {
    [CanvasNodeType.Image]: "图片",
    [CanvasNodeType.Video]: "视频",
    [CanvasNodeType.Audio]: "音频",
    [CanvasNodeType.Text]: "文本",
    [CanvasNodeType.Config]: "生成配置",
    [CanvasNodeType.Group]: "分组",
};

export function CanvasInspectorPanel({ node, onTitleChange, onOpenSettings, onUpload }: Props) {
    const { importVideo, importAudio } = useCanvasHost();
    const { theme } = useCanvasTheme();
    const inspectorOpen = useCanvasSidePanelStore((state) => state.inspectorOpen);
    const toggleInspector = useCanvasSidePanelStore((state) => state.toggleInspector);
    const isMediaNode = node?.type === CanvasNodeType.Image || node?.type === CanvasNodeType.Video || node?.type === CanvasNodeType.Audio;
    const canUpload = node?.type === CanvasNodeType.Image || (node?.type === CanvasNodeType.Video && Boolean(importVideo)) || (node?.type === CanvasNodeType.Audio && Boolean(importAudio));
    const dimensions = useMemo(() => node ? `${Math.round(node.width)} × ${Math.round(node.height)}` : "", [node]);

    if (!inspectorOpen) {
        return (
            <button type="button" onClick={toggleInspector} className="absolute right-3 top-20 z-50 grid size-8 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label="打开属性面板" title="打开属性面板" data-canvas-no-zoom>
                <ChevronLeft className="size-4" />
            </button>
        );
    }

    return (
        <aside
            className="canvas-inspector-panel flex h-full w-[280px] min-w-0 shrink-0 flex-col overflow-hidden border-l"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            data-canvas-no-zoom
        >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: theme.toolbar.border }}>
                <div>
                    <div className="text-sm font-semibold">属性</div>
                    <div className="mt-0.5 text-[11px] opacity-50">当前选中内容</div>
                </div>
                <button type="button" onClick={toggleInspector} className="grid size-7 place-items-center rounded-md opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" aria-label="收起属性面板" title="收起属性面板">
                    <ChevronRight className="size-4" />
                </button>
            </div>

            {node ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="flex items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center">
                            {node.type === CanvasNodeType.Video ? <Video className="size-4" /> : node.type === CanvasNodeType.Audio ? <Music2 className="size-4" /> : node.type === CanvasNodeType.Text ? <Type className="size-4" /> : node.type === CanvasNodeType.Config ? <Settings2 className="size-4" /> : node.type === CanvasNodeType.Group ? <Square className="size-4" /> : node.type === CanvasNodeType.Image ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <label className="mb-1 block text-[11px] opacity-55" htmlFor="canvas-inspector-title">名称</label>
                            <input id="canvas-inspector-title" value={node.title} onChange={(event) => onTitleChange(node.id, event.target.value)} className="w-full border-b border-transparent bg-transparent py-0.5 text-sm font-medium outline-none focus:border-current" style={{ color: theme.node.text }} />
                            <div className="mt-1 text-xs opacity-50">{nodeTypeLabel[node.type] || node.type}</div>
                        </div>
                    </div>

                    <div className="mt-5 space-y-3 text-xs">
                        <Property label="画布尺寸" value={dimensions} />
                        <Property label="状态" value={node.metadata?.status === "loading" ? "处理中" : node.metadata?.status === "error" ? "失败" : node.metadata?.status === "success" ? "已完成" : "待处理"} />
                        {node.metadata?.assetId ? <Property label="素材" value={node.metadata.assetId} mono /> : null}
                        {node.metadata?.taskId ? <Property label="任务" value={node.metadata.taskId} mono /> : null}
                        {node.metadata?.versionId ? <Property label="版本" value={node.metadata.versionId} mono /> : null}
                    </div>

                    {node.metadata?.errorDetails ? <div className="mt-5 break-words rounded-lg px-3 py-2.5 text-xs leading-5" style={{ background: `color-mix(in srgb, #ef4444 10%, ${theme.toolbar.panel})`, color: theme.node.text }}>{node.metadata.errorDetails}</div> : null}

                    <div className="mt-6 flex flex-wrap gap-2">
                        <button type="button" onClick={() => onOpenSettings(node)} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10">
                            <Pencil className="size-3.5" />编辑属性
                        </button>
                        {isMediaNode && canUpload ? <button type="button" onClick={() => onUpload(node)} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10">
                            <Upload className="size-3.5" />{node.metadata?.content ? "替换素材" : "上传素材"}
                        </button> : null}
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-sm opacity-55">
                    <div>选择画布中的内容</div>
                    <div className="mt-1 text-xs opacity-75">这里会显示尺寸、素材和任务信息</div>
                </div>
            )}
        </aside>
    );
}

function Property({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3"><span className="shrink-0 opacity-50">{label}</span><span className={`min-w-0 truncate text-right ${mono ? "font-mono text-[10px]" : "font-medium"}`} title={value}>{value}</span></div>;
}
