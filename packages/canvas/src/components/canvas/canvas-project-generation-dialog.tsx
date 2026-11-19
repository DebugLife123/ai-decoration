import { Button, Input, Modal } from "antd";
import { Image as ImageIcon, SlidersHorizontal, Sparkles, StopCircle, WandSparkles } from "lucide-react";
import type { CanvasTheme } from "../../lib/canvas-theme";

export type CanvasProjectGenerationMode = "generate" | "adjust";

export type CanvasProjectGenerationDialogProps = {
    open: boolean;
    mode: CanvasProjectGenerationMode;
    spaceType: string;
    styleDirection: string;
    reference?: { name: string; url: string };
    prompt: string;
    busy?: boolean;
    error?: string;
    theme: CanvasTheme;
    onModeChange: (mode: CanvasProjectGenerationMode) => void;
    onPromptChange: (prompt: string) => void;
    onSubmit: () => void;
    onCancelGeneration?: () => void;
    onClose: () => void;
};

export function CanvasProjectGenerationDialog({ open, mode, spaceType, styleDirection, reference, prompt, busy = false, error, theme, onModeChange, onPromptChange, onSubmit, onCancelGeneration, onClose }: CanvasProjectGenerationDialogProps) {
    const title = mode === "generate" ? "生成新方案" : "调整当前方案";
    const placeholder = mode === "generate"
        ? "描述你希望生成的空间效果，例如：保留原有门窗和空间比例，增加浅色布艺沙发、木色电视柜和自然采光。"
        : "描述需要调整的内容，例如：保留原有布局，将沙发改为低饱和绿色，保持镜头、光线和其他家具不变。";

    return (
        <Modal className="canvas-overlay-modal" open={open} centered width={680} title={null} footer={null} onCancel={onClose} destroyOnHidden>
            <div data-canvas-no-zoom className="flex flex-col gap-5" style={{ color: theme.node.text }}>
                <header className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2 text-xs font-semibold opacity-60">
                            {mode === "generate" ? <Sparkles className="size-3.5" /> : <SlidersHorizontal className="size-3.5" />}
                            画布方案工作流
                        </div>
                        <h2 className="m-0 text-xl font-semibold">{title}</h2>
                        <p className="mt-1 text-sm opacity-60">基于当前参考图和空间条件提交一次新的 AI 生成请求。</p>
                    </div>
                    <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full border bg-transparent opacity-70 transition hover:opacity-100" style={{ borderColor: theme.toolbar.border }} onClick={onClose} aria-label="关闭提示词弹窗">×</button>
                </header>

                <div className="grid grid-cols-2 gap-2 rounded-xl p-1" style={{ background: theme.toolbar.activeBg }} role="group" aria-label="方案工作方式">
                    {([['generate', '生成新方案'], ['adjust', '调整当前方案']] as const).map(([value, label]) => (
                        <button key={value} type="button" className="flex min-h-9 items-center justify-center gap-2 rounded-lg border-0 bg-transparent text-sm transition" style={{ background: mode === value ? theme.toolbar.panel : "transparent", color: theme.node.text }} aria-pressed={mode === value} onClick={() => onModeChange(value)}>
                            {value === "generate" ? <Sparkles className="size-4" /> : <SlidersHorizontal className="size-4" />}
                            {label}
                        </button>
                    ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                    <div className="rounded-xl border p-3" style={{ borderColor: theme.toolbar.border }}>
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold opacity-65"><ImageIcon className="size-3.5" />参考素材</div>
                        {reference ? <div className="flex items-center gap-3"><img src={reference.url} alt="" className="size-14 rounded-lg object-cover" /><div className="min-w-0"><strong className="block truncate text-sm">{reference.name}</strong><span className="text-xs opacity-60">{spaceType} · {styleDirection}</span></div></div> : <div className="text-sm opacity-55">请先在左侧选择一张图片素材。</div>}
                    </div>
                    <div className="rounded-xl border p-3" style={{ borderColor: theme.toolbar.border }}>
                        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold opacity-65"><span>补充要求</span><span className="font-normal">{prompt.length}/600</span></div>
                        <Input.TextArea value={prompt} disabled={busy} autoSize={{ minRows: 5, maxRows: 9 }} maxLength={600} placeholder={placeholder} onChange={(event) => onPromptChange(event.target.value)} onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); onSubmit(); } }} />
                    </div>
                </div>

                {error ? <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#ef4444", color: "#ef4444" }} role="alert">{error}</div> : null}
                <div className="flex items-center justify-end gap-2">
                    {busy && onCancelGeneration ? <Button danger icon={<StopCircle className="size-4" />} onClick={onCancelGeneration}>停止等待</Button> : <Button onClick={onClose} disabled={busy}>取消</Button>}
                    <Button type="primary" icon={<WandSparkles className="size-4" />} loading={busy} disabled={busy || !reference || !prompt.trim()} onClick={onSubmit}>{mode === "generate" ? "生成方案" : "提交调整"}</Button>
                </div>
            </div>
        </Modal>
    );
}
