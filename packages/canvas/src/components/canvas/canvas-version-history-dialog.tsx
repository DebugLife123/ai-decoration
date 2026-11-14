import { useCallback, useState } from "react";
import { Check, Eye, History, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { App, Button, Empty, Input, Modal, Popconfirm, Segmented, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes, type CanvasBackgroundMode } from "../../lib/canvas-theme";
import type { CanvasVersionDocument } from "../../features/canvas/contracts";
import { deleteCanvasVersionAndSelect, saveCanvasVersionSnapshot } from "../../features/canvas/version-actions";
import { useCanvasHost, useCanvasTheme } from "../../features/canvas/canvas-host";
import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "../../types/canvas";
import { useCanvasVersionHistory } from "./use-canvas-version-history";
import { getCanvasImageLineagePairs } from "../../features/canvas/image-lineage";

export function CanvasVersionHistoryDialog({
    open,
    projectId,
    nodes,
    connections,
    backgroundMode,
    showImageInfo,
    viewport,
    onClose,
    onRestore,
}: {
    open: boolean;
    projectId: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    onClose: () => void;
    onRestore: (version: CanvasVersionDocument) => void;
}) {
    const { message } = App.useApp();
    const { media, versions: versionHost } = useCanvasHost();
    const { i18n, t } = useTranslation();
    const { colorTheme, theme } = useCanvasTheme();
    const [title, setTitle] = useState("");
    const [previewMode, setPreviewMode] = useState<"compare" | "current" | "version" | "sourceResult">("compare");
    const handleVersionsLoadError = useCallback((error: unknown) => message.error(error instanceof Error ? error.message : "版本加载失败"), [message]);
    const {
        versions,
        currentVersionId,
        selectedVersion,
        selectedVersionId,
        setSelectedVersionId,
        previewNodes,
        previewLoading,
        previewError,
        retryPreview,
    } = useCanvasVersionHistory({
        open,
        projectId,
        media,
        versionHost,
        onLoadError: handleVersionsLoadError,
    });

    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen) setTitle("");
    };

    const saveCurrentVersion = () => {
        const versionTitle = title.trim() || t("canvas.versions.untitled", { count: versions.length + 1 });
        void saveCanvasVersionSnapshot(versionHost, projectId, { title: versionTitle, createdAt: new Date().toISOString(), nodes, connections, backgroundMode, showImageInfo, viewport }).then((id) => {
            setSelectedVersionId(id);
            setTitle("");
            message.success(t("canvas.versions.saved"));
        }).catch((error: unknown) => message.error(error instanceof Error ? error.message : "版本保存失败"));
    };

    const dateText = (value: string) => new Date(value).toLocaleString(i18n.resolvedLanguage || "zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

    return (
        <Modal className="canvas-overlay-modal" title={t("canvas.versions.title")} open={open} onCancel={onClose} afterOpenChange={handleOpenChange} footer={null} centered width={960} destroyOnHidden>
            <div className="space-y-5 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} onPressEnter={saveCurrentVersion} maxLength={80} placeholder={t("canvas.versions.namePlaceholder")} aria-label={t("canvas.versions.namePlaceholder")} className="min-w-48 flex-1" />
                    <Button type="primary" icon={<Save className="size-4" />} onClick={saveCurrentVersion}>
                        {t("canvas.versions.save")}
                    </Button>
                </div>

                <div className="grid min-h-72 grid-cols-1 gap-5 md:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.2fr)]">
                    <section className="min-w-0">
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-sm font-semibold">{t("canvas.versions.listTitle")}</h3>
                            <span className="text-xs" style={{ color: theme.node.muted }}>{versions.length}</span>
                        </div>
                        <div className="thin-scrollbar max-h-[48vh] overflow-y-auto border-t" style={{ borderColor: theme.node.stroke }}>
                            {versions.length ? versions.map((version) => {
                                const selected = version.versionId === selectedVersionId;
                                return (
                                    <div key={version.versionId} className="flex items-start gap-2 border-b px-2 py-3" style={{ borderColor: theme.node.stroke, background: selected ? theme.toolbar.itemHover : "transparent" }}>
                                        <button type="button" aria-pressed={selected} onClick={() => setSelectedVersionId(version.versionId)} className="min-w-0 flex-1 text-left">
                                            <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                                                <span className="max-w-full truncate">{version.title}</span>
                                                {currentVersionId === version.versionId ? <Tag color="green" className="mr-0">{t("canvas.versions.current")}</Tag> : null}
                                            </span>
                                            <span className="mt-1 block text-xs" style={{ color: theme.node.muted }}>{dateText(version.createdAt)}</span>
                                            <span className="mt-1 block text-xs" style={{ color: theme.node.muted }}>{t("canvas.versions.stats", { nodes: version.nodes.length, connections: version.connections.length })}</span>
                                        </button>
                                        <div className="flex shrink-0 items-center gap-0.5">
                                            <Button type="text" size="small" icon={<Eye className="size-4" />} aria-label={t("canvas.versions.compare")} title={t("canvas.versions.compare")} onClick={() => setSelectedVersionId(version.versionId)} />
                                            <Popconfirm title={t("canvas.versions.restoreTitle")} description={t("canvas.versions.restoreDescription")} okText={t("canvas.versions.restore")} cancelText={t("common.cancel")} onConfirm={() => onRestore(version)}>
                                                <Button type="text" size="small" icon={<RotateCcw className="size-4" />} aria-label={t("canvas.versions.restore")} title={t("canvas.versions.restore")} />
                                            </Popconfirm>
                                            <Popconfirm title={t("canvas.versions.deleteTitle")} description={t("canvas.versions.deleteDescription")} okText={t("common.delete")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onConfirm={() => {
                                                void deleteCanvasVersionAndSelect(versionHost, projectId, version.versionId).then((nextSelectedId) => {
                                                    setSelectedVersionId(nextSelectedId);
                                                    message.success(t("canvas.versions.deleted"));
                                                }).catch((error: unknown) => message.error(error instanceof Error ? error.message : "版本删除失败"));
                                            }}>
                                                <Button type="text" size="small" danger icon={<Trash2 className="size-4" />} aria-label={t("canvas.versions.delete")} title={t("canvas.versions.delete")} />
                                            </Popconfirm>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="py-8"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.versions.empty")} /></div>
                            )}
                        </div>
                    </section>

                    <section className="min-w-0">
                        <div className="mb-2 flex items-center gap-2">
                            <History className="size-4" />
                            <h3 className="text-sm font-semibold">{t("canvas.versions.compare")}</h3>
                        </div>
                        {selectedVersion ? (
                            <>
                                <div className="mb-3 flex justify-end">
                                    <Segmented
                                        size="small"
                                        value={previewMode}
                                        onChange={(value) => setPreviewMode(value as typeof previewMode)}
                                        options={[
                                            { label: t("canvas.versions.sideBySide"), value: "compare" },
                                            { label: t("canvas.versions.currentPreview"), value: "current" },
                                            { label: t("canvas.versions.versionPreview"), value: "version" },
                                            { label: t("canvas.versions.sourceResult"), value: "sourceResult" },
                                        ]}
                                    />
                                    {previewMode === "version" ? <span className="max-w-48 truncate text-xs" style={{ color: theme.node.muted }} title={selectedVersion.title}>{selectedVersion.title}</span> : null}
                                </div>
                                {previewMode === "sourceResult" ? <ImageLineageColumn nodes={previewNodes} connections={selectedVersion.connections} loading={previewLoading} error={previewError} onRetry={retryPreview} theme={theme} emptyText={t("canvas.versions.noLineage")} sourceLabel={t("canvas.versions.sourceImage")} resultLabel={t("canvas.versions.resultImage")} /> : (
                                    <div className={previewMode === "compare" ? "grid min-h-64 grid-cols-1 gap-3 sm:grid-cols-2" : "min-h-64"}>
                                        {previewMode !== "version" ? <VersionColumn title={t("canvas.versions.currentCanvas")} nodes={nodes} connections={connections} loading={false} theme={theme} emptyText={t("canvas.versions.noImages")} /> : null}
                                        {previewMode !== "current" ? <VersionColumn title={selectedVersion.title} nodes={previewNodes} connections={selectedVersion.connections} loading={previewLoading} error={previewError} onRetry={retryPreview} theme={theme} emptyText={t("canvas.versions.noImages")} /> : null}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="grid min-h-64 place-items-center border-t" style={{ borderColor: theme.node.stroke }}>
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.versions.selectToCompare")} />
                            </div>
                        )}
                    </section>
                </div>
                <div className="flex items-center gap-2 border-t pt-3 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    <Check className="size-3.5 shrink-0" />
                    <span>{t("canvas.versions.localNote")}</span>
                </div>
            </div>
        </Modal>
    );
}

function ImageLineageColumn({ nodes, connections, loading, error = false, onRetry = () => undefined, theme, emptyText, sourceLabel, resultLabel }: {
    nodes: CanvasNodeData[]; connections: CanvasConnection[]; loading: boolean; error?: boolean; onRetry?: () => void;
    theme: (typeof canvasThemes)["light"] | (typeof canvasThemes)["dark"]; emptyText: string; sourceLabel: string; resultLabel: string;
}) {
    const { t } = useTranslation();
    const pairs = getCanvasImageLineagePairs(nodes, connections);
    if (loading) return <div className="grid min-h-64 place-items-center text-xs" style={{ color: theme.node.muted }}>{t("canvas.versions.loading")}</div>;
    if (error) return <div className="grid min-h-64 place-items-center gap-2 text-xs" style={{ color: theme.node.muted }}><span>{t("canvas.versions.previewFailed")}</span><Button size="small" type="text" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>{t("common.retry")}</Button></div>;
    if (!pairs.length) return <div className="grid min-h-64 place-items-center text-center text-xs" style={{ color: theme.node.muted }}>{emptyText}</div>;
    return <div className="thin-scrollbar max-h-[48vh] space-y-3 overflow-y-auto">
        {pairs.map(({ source, result }) => <div key={result.id} className="grid grid-cols-2 gap-3">
            {[{ node: source, label: sourceLabel }, { node: result, label: resultLabel }].map(({ node, label }) => <figure key={node.id} className="min-w-0 overflow-hidden border" style={{ borderColor: theme.node.stroke, background: theme.canvas.background }}>
                <div className="grid aspect-[4/3] place-items-center"><PreviewImage key={`${node.id}:${node.metadata?.content}`} src={node.metadata?.content} alt={node.title || label} failedText={label} /></div>
                <figcaption className="truncate border-t px-2 py-1.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}: {node.title}</figcaption>
            </figure>)}
        </div>)}
    </div>;
}

function VersionColumn({
    title,
    nodes,
    connections,
    loading,
    error = false,
    onRetry = () => undefined,
    theme,
    emptyText,
}: {
    title: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    loading: boolean;
    error?: boolean;
    onRetry?: () => void;
    theme: (typeof canvasThemes)["light"] | (typeof canvasThemes)["dark"];
    emptyText: string;
}) {
    const { t } = useTranslation();
    const images = nodes.filter((node) => node.type === "image" && node.metadata?.content);
    return (
        <div className="min-w-0 border-t pt-2" style={{ borderColor: theme.node.stroke }}>
            <div className="mb-2">
                <h4 className="truncate text-xs font-semibold" title={title}>{title}</h4>
                <p className="mt-1 text-[11px]" style={{ color: theme.node.muted }}>{t("canvas.versions.stats", { nodes: nodes.length, connections: connections.length })}</p>
            </div>
            <div className="thin-scrollbar max-h-64 space-y-2 overflow-y-auto">
                {loading ? <div className="py-8 text-center text-xs" style={{ color: theme.node.muted }}>{t("canvas.versions.loading")}</div> : error ? <div className="grid min-h-36 place-items-center gap-2 text-center text-xs" style={{ color: theme.node.muted }}><span>{t("canvas.versions.previewFailed")}</span><Button size="small" type="text" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>{t("common.retry")}</Button></div> : images.length ? images.map((node) => (
                    <figure key={node.id} className="overflow-hidden border" style={{ borderColor: theme.node.stroke, background: theme.canvas.background }}>
                        <div className="grid aspect-[4/3] place-items-center">
                            <PreviewImage key={`${node.id}:${node.metadata?.content}`} src={node.metadata?.content} alt={node.title || t("canvas.nodeTypes.image")} failedText={t("canvas.versions.imageFailed")} />
                        </div>
                        <figcaption className="truncate border-t px-2 py-1.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{node.title || t("canvas.nodeTypes.image")}</figcaption>
                    </figure>
                )) : <div className="grid min-h-36 place-items-center text-center text-xs" style={{ color: theme.node.muted }}>{emptyText}</div>}
            </div>
        </div>
    );
}

function PreviewImage({ src, alt, failedText }: { src?: string; alt: string; failedText: string }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) return <span className="px-3 text-center text-xs text-red-500/80">{failedText}</span>;
    return <img src={src} alt={alt} className="max-h-full max-w-full object-contain" onError={() => setFailed(true)} />;
}
