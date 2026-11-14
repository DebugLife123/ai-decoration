import { AlertCircle, CheckCircle2, Clock3, Download, LocateFixed, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { CanvasHostTaskRecord } from "../../features/canvas/canvas-host";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";
import { hasResumableVideoTask, hasVideoTaskReference } from "../../lib/canvas/video-task-handle";

type TaskState = "processing" | "completed" | "failed" | "timeout" | "partial";

type Props = {
    nodes: CanvasNodeData[];
    taskRecords?: CanvasHostTaskRecord[];
    onFocusNode?: (nodeId: string) => void;
    onRetry?: (node: CanvasNodeData, imageId?: string) => void;
    onExportResults?: () => void;
    exporting?: boolean;
};

type NodeTaskRow = { kind: "node"; key: string; node: CanvasNodeData; state: TaskState; counts: ReturnType<typeof getCounts> };
type HostTaskRow = { kind: "task"; key: string; record: CanvasHostTaskRecord; state: TaskState; counts: null };

function getTaskState(node: CanvasNodeData): TaskState | null {
    if (![CanvasNodeType.Image, CanvasNodeType.Text, CanvasNodeType.Video, CanvasNodeType.Audio].includes(node.type as CanvasNodeType) || !isGeneratedTask(node)) return null;
    const images = node.metadata?.images || [];
    const texts = node.metadata?.texts || [];
    const pending = images.some((item) => item.status === "loading") || texts.some((item) => item.status === "loading");
    const failed = images.some((item) => item.status === "error") || texts.some((item) => item.status === "error");
    const completed = images.some((item) => item.status === "success") || texts.some((item) => item.status === "success");
    if (node.metadata?.status === "loading" || pending) return "processing";
    if (node.metadata?.errorCode === "timeout") return "timeout";
    if (node.metadata?.status !== "error" && hasResumableVideoTask(node)) return "processing";
    if (hasVideoTaskReference(node) && !hasResumableVideoTask(node)) return "failed";
    if (failed && completed) return "partial";
    if (failed || node.metadata?.status === "error") return "failed";
    if ((node.metadata?.status === "success" || completed) && isGeneratedTask(node)) return "completed";
    return null;
}

function isGeneratedTask(node: CanvasNodeData) {
    return Boolean(node.metadata?.taskId || node.metadata?.model || node.metadata?.generationType || node.metadata?.generationMode || node.metadata?.videoTaskId);
}

function getCounts(node: CanvasNodeData) {
    const items = [...(node.metadata?.images || []), ...(node.metadata?.texts || [])];
    return items.length ? { success: items.filter((item) => item.status === "success").length, pending: items.filter((item) => item.status === "loading").length, failed: items.filter((item) => item.status === "error").length } : null;
}

function canExport(node: CanvasNodeData) {
    if (!isGeneratedTask(node)) return false;
    if (node.type === CanvasNodeType.Text) return Boolean(node.metadata?.content || node.metadata?.texts?.some((item) => item.status === "success" && item.content));
    return Boolean(node.metadata?.content || node.metadata?.images?.some((item) => item.status === "success" && item.content));
}

function getHostTaskState(record: CanvasHostTaskRecord): TaskState {
    if (record.task.status === "QUEUED" || record.task.status === "RUNNING") return "processing";
    return record.task.status === "SUCCEEDED" ? "completed" : "failed";
}

export function CanvasTaskStatusPanel({ nodes, taskRecords = [], onFocusNode, onRetry, onExportResults, exporting = false }: Props) {
    const { t } = useTranslation();
    const rows = useMemo(
        () => {
            const nodeRows: NodeTaskRow[] = nodes
                .slice()
                .reverse()
                .map((node) => ({ kind: "node" as const, key: `node:${node.id}`, node, state: getTaskState(node), counts: getCounts(node) }))
                .filter((item): item is NodeTaskRow => Boolean(item.state));
            const nodeTaskIds = new Set(nodeRows.map((row) => row.node.metadata?.taskId).filter(Boolean));
            const hostRows: HostTaskRow[] = taskRecords
                .filter((record) => !nodeTaskIds.has(record.task.taskId))
                .slice()
                .reverse()
                .map((record) => ({ kind: "task", key: `task:${record.task.taskId}`, record, state: getHostTaskState(record), counts: null }));
            return [...hostRows, ...nodeRows].sort((a, b) => Number(a.state === "completed") - Number(b.state === "completed"));
        },
        [nodes, taskRecords],
    );
    const exportableCount = useMemo(() => nodes.filter(canExport).length, [nodes]);
    const processingCount = rows.filter((row) => row.state === "processing").length;
    const attentionCount = rows.filter((row) => ["failed", "timeout", "partial"].includes(row.state)).length;
    const completedCount = rows.filter((row) => row.state === "completed").length;

    return (
        <div className="flex h-full flex-col">
            {rows.length ? <div className="flex items-start justify-between gap-3 border-b px-3 pb-3 pt-2.5">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <span>{t("canvas.sidePanel.tasks")}</span>
                        {rows.length ? <span className="text-xs font-normal opacity-45">{rows.length}</span> : null}
                    </div>
                    <div className="mt-1 text-xs opacity-55">
                        {processingCount ? t("canvas.sidePanel.tasksProcessing", { count: processingCount }) : null}
                        {attentionCount ? `${processingCount ? " · " : ""}${t("canvas.sidePanel.tasksAttention", { count: attentionCount })}` : ""}
                        {completedCount ? `${processingCount || attentionCount ? " · " : ""}${t("canvas.sidePanel.tasksCompleted", { count: completedCount })}` : ""}
                    </div>
                </div>
                {exportableCount && onExportResults ? (
                    <button type="button" onClick={onExportResults} disabled={exporting} className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium opacity-75 transition hover:bg-black/5 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10">
                        <Download className="size-3.5" />
                        {t("canvas.sidePanel.exportResults")}
                    </button>
                ) : null}
            </div> : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {rows.length ? (
                    <div className="space-y-1.5">
                        {rows.map((row) => {
                            const { state, counts } = row;
                            const node = row.kind === "node" ? row.node : undefined;
                            const task = row.kind === "task" ? row.record.task : undefined;
                            const title = node?.title || (row.kind === "task" ? row.record.title : undefined) || t("canvas.sidePanel.tasks");
                            const taskId = task?.taskId || node?.metadata?.taskId;
                            const versionId = task?.versionId || node?.metadata?.versionId;
                            const assetId = task?.resultAssetId || node?.metadata?.assetId;
                            const errorDetails = task?.error ? `${task.error.code}: ${task.error.message}` : node?.metadata?.errorDetails;
                            const canQueryVideoTask = Boolean(node && hasVideoTaskReference(node) && node.metadata?.status !== "loading");
                            return (
                                <div key={row.key} className="rounded-lg px-2.5 py-2 transition hover:bg-black/5 dark:hover:bg-white/5">
                                    <div className="flex items-start gap-2">
                                        <StatusIcon state={state} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">{title}</div>
                                            <div className="mt-0.5 text-xs opacity-55">{t(`canvas.sidePanel.taskStatus.${state}`)}</div>
                                            {taskId || versionId || assetId ? (
                                                <div className="mt-1 space-y-0.5 text-[10px] opacity-45">
                                                    {taskId ? <div className="truncate">taskId: {taskId}</div> : null}
                                                    {versionId ? <div className="truncate">versionId: {versionId}</div> : null}
                                                    {assetId ? <div className="truncate">assetId: {assetId}</div> : null}
                                                </div>
                                            ) : null}
                                            {counts ? <div className="mt-1 text-xs opacity-45">{t("canvas.sidePanel.taskCounts", counts)}</div> : null}
                                            {errorDetails ? <div className="mt-1 line-clamp-2 text-xs text-red-500/80">{errorDetails}</div> : null}
                                        </div>
                                        {node && onFocusNode ? (
                                            <button type="button" onClick={() => onFocusNode(node.id)} className="grid size-7 shrink-0 place-items-center rounded-md opacity-55 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10" aria-label={t("canvas.sidePanel.focusNode")} title={t("canvas.sidePanel.focusNode")}>
                                                <LocateFixed className="size-3.5" />
                                            </button>
                                        ) : null}
                                        {node && onRetry && (state !== "processing" || canQueryVideoTask) && state !== "completed" && !node.metadata?.images?.some((image) => image.status === "error") ? (
                                            <button type="button" onClick={() => onRetry(node)} className="grid size-7 shrink-0 place-items-center rounded-md opacity-55 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10" aria-label={t(canQueryVideoTask ? "canvas.nodeToolbar.queryVideoTask" : "canvas.sidePanel.retryTask")} title={t(canQueryVideoTask ? "canvas.nodeToolbar.queryVideoTask" : "canvas.sidePanel.retryTask")}>
                                                <RefreshCw className="size-3.5" />
                                            </button>
                                        ) : null}
                                    </div>
                                    {node && onRetry && node.metadata?.images?.some((image) => image.status === "error") ? (
                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-6">
                                            {node.metadata.images.map((image, index) => image.status === "error" ? (
                                                <button key={image.id} type="button" onClick={() => onRetry(node, image.id)} className="inline-flex items-center gap-1 text-xs opacity-60 transition hover:opacity-100">
                                                    <RefreshCw className="size-3" />
                                                    {t("canvas.sidePanel.retryImage", { index: index + 1 })}
                                                </button>
                                            ) : null)}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function StatusIcon({ state }: { state: TaskState }) {
    if (state === "processing") return <Clock3 className="mt-0.5 size-4 shrink-0 text-amber-500" />;
    if (state === "timeout") return <Clock3 className="mt-0.5 size-4 shrink-0 text-red-500" />;
    if (state === "partial") return <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />;
    if (state === "completed") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />;
    return <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />;
}
