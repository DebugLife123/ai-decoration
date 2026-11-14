import { useCanvasTheme } from "../../features/canvas/canvas-host";
import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Empty, Input, Modal, Pagination, Popconfirm, Select, Spin, Tabs, Tag } from "antd";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/utils";
import { canvasThemes } from "../../lib/canvas-theme";
import type { CanvasAssetLibrary, CanvasLibrarySource, InsertAssetPayload } from "../../features/canvas/asset-library";

export type { InsertAssetPayload } from "../../features/canvas/asset-library";

type Props = {
    open: boolean;
    library: CanvasAssetLibrary;
    defaultTab?: string;
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
};

export function AssetPickerModal({ open, library, defaultTab = "my-assets", onInsert, onClose }: Props) {
    const { t } = useTranslation();
    return (
        <Modal className="canvas-overlay-modal" title={t("canvas.assetPicker.title")} open={open} onCancel={onClose} footer={null} width={860} destroyOnHidden styles={{ body: { padding: "0 24px 24px", minHeight: 480 } }}>
            {open ? <LibraryBrowser library={library} defaultTab={defaultTab} onInsert={onInsert} /> : null}
        </Modal>
    );
}

function LibraryBrowser({ library, defaultTab, onInsert }: Pick<Props, "library" | "onInsert"> & { defaultTab: string }) {
    const [result, setResult] = useState<{ library: CanvasAssetLibrary; sources: CanvasLibrarySource[] }>();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [revision, setRevision] = useState(0);
    const [activeTab, setActiveTab] = useState(defaultTab);
    useEffect(() => library.subscribe?.(() => setRevision((value) => value + 1)), [library]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        void library.list().then((sources) => {
            if (active) setResult({ library, sources });
        }).catch((reason: unknown) => {
            if (active) setError(reason instanceof Error ? reason.message : "素材加载失败");
        }).finally(() => {
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [library, revision]);

    if (result?.library !== library && (loading || !error)) return <div className="flex justify-center py-12" role="status" aria-label="素材加载中"><Spin /></div>;
    if (error) return <Alert type="error" showIcon title={error} action={<Button type="text" icon={<RefreshCw className="size-4" />} onClick={() => setRevision((value) => value + 1)}>重试</Button>} />;
    const sources = result?.sources || [];
    if (!sources.length) return <Empty />;
    return <Tabs activeKey={sources.some((source) => source.id === activeTab) ? activeTab : sources[0].id} onChange={setActiveTab} items={sources.map((source) => ({ key: source.id, label: source.label, children: <LibraryTab source={source} onInsert={onInsert} onChanged={() => setRevision((value) => value + 1)} /> }))} />;
}

const PAGE_SIZE = 8;
const kindOptions = ["all", "text", "image", "video", "audio"];

function LibraryTab({ source, onInsert, onChanged }: { source: CanvasLibrarySource; onInsert: Props["onInsert"]; onChanged: () => void }) {
    const { t } = useTranslation();
    const { theme } = useCanvasTheme();
    const { message } = App.useApp();
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState("all");
    const [groupFilter, setGroupFilter] = useState("all");
    const [page, setPage] = useState(1);
    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return source.items.filter((item) => (kindFilter === "all" || item.payload.kind === kindFilter) && (groupFilter === "all" || item.groupId === groupFilter) && (!query || item.searchText.toLowerCase().includes(query)));
    }, [source.items, keyword, kindFilter, groupFilter]);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
    const remove = async (assetId: string) => {
        if (!source.remove) return;
        setRemovingId(assetId);
        try {
            await source.remove(assetId);
            message.success(t("canvas.assetPicker.projectAssetDeleted"));
            onChanged();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.assetPicker.deleteFailed"));
        } finally {
            setRemovingId(null);
        }
    };
    if (source.loading) return <div className="flex justify-center py-12" role="status" aria-label="素材加载中"><Spin /></div>;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input className="w-56" size="small" prefix={<Search className="size-3.5" />} placeholder={t("canvas.assetPicker.search")} value={keyword} allowClear onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
                {source.groups ? <Select size="small" className="w-44" value={groupFilter} onChange={(value) => { setGroupFilter(value); setPage(1); }} options={[{ label: t("common.all"), value: "all" }, ...source.groups]} /> : null}
                <div className="flex flex-wrap gap-1.5">
                    {kindOptions.filter((option) => option !== "audio" || source.items.some((item) => item.payload.kind === "audio")).map((option) => <Tag.CheckableTag key={option} checked={kindFilter === option} className={cn("prompt-filter-tag", kindFilter === option && "is-active")} onChange={() => { setKindFilter(option); setPage(1); }}>{option === "all" ? t("common.all") : t(`assets.kinds.${option}`)}</Tag.CheckableTag>)}
                </div>
            </div>
            {filtered.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((item) => (
                        <div key={item.id} className="overflow-hidden rounded-lg border text-left transition hover:opacity-80" style={{ background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                            <button type="button" aria-label={`${t("canvas.assetPicker.insert")}：${item.title}`} className="block w-full cursor-pointer text-left" onClick={() => onInsert(item.payload)}>
                                {item.cover ? <img src={item.cover} alt={item.title} className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center p-3 text-center text-xs" style={{ color: theme.node.muted }}>{item.title}</div>}
                                <div className="p-2.5">
                                    <div className="flex items-center justify-between gap-2"><span className="line-clamp-1 text-xs font-medium">{item.title}</span><Tag className="m-0 shrink-0 text-[10px]">{t(`assets.kinds.${item.payload.kind}`)}</Tag></div>
                                    {item.subtitle ? <div className="mt-1 truncate text-[10px]" style={{ color: theme.node.muted }}>{item.subtitle}</div> : null}
                                </div>
                            </button>
                            {source.remove ? <div className="flex justify-end border-t px-2 py-1.5" style={{ borderColor: theme.toolbar.border }}><Popconfirm title={t("canvas.assetPicker.deleteProjectAsset")} description={t("canvas.assetPicker.deleteProjectAssetDescription")} okText={t("common.delete")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onConfirm={() => remove(item.id)}><button type="button" disabled={removingId === item.id} className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10" style={{ color: theme.node.muted }}><Trash2 className="size-3" />{t("common.delete")}</button></Popconfirm></div> : null}
                        </div>
                    ))}
                </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(source.id === "workspaces" ? "workspace.assetPicker.workspaceEmpty" : "canvas.assetPicker.empty")} className="py-12" />}
            {filtered.length > PAGE_SIZE ? <div className="flex justify-center"><Pagination size="small" current={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} showSizeChanger={false} /></div> : null}
        </div>
    );
}
