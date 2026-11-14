import { useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { CanvasTheme } from "../../lib/canvas-theme";
import "../../styles/canvas-workbench.css";

type CanvasWorkbenchLayoutProps = {
    theme: CanvasTheme;
    headerStart: ReactNode;
    headerEnd?: ReactNode;
    leftPanel: ReactNode;
    rightPanel: ReactNode;
    children: ReactNode;
    leftPanelWidth?: number;
    rightPanelWidth?: number;
};

export function CanvasWorkbenchLayout({ theme, headerStart, headerEnd, leftPanel, rightPanel, children, leftPanelWidth = 272, rightPanelWidth = 348 }: CanvasWorkbenchLayoutProps) {
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);
    const [mobilePanel, setMobilePanel] = useState<"left" | "right" | null>(null);

    useEffect(() => {
        if (!mobilePanel) return;
        const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobilePanel(null); };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [mobilePanel]);

    return (
        <main className="canvas-workbench" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <header className="canvas-workbench__header" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                <div className="canvas-workbench__header-start">
                    <button className="canvas-workbench__mobile-toggle" type="button" aria-label={mobilePanel === "left" ? "关闭设计素材" : "打开设计素材"} title={mobilePanel === "left" ? "关闭设计素材" : "打开设计素材"} onClick={() => setMobilePanel(mobilePanel === "left" ? null : "left")}>{mobilePanel === "left" ? <PanelLeftClose /> : <PanelLeftOpen />}</button>
                    <button className="canvas-workbench__desktop-toggle" type="button" aria-label={leftCollapsed ? "展开设计素材" : "收起设计素材"} aria-expanded={!leftCollapsed} aria-controls="canvas-workbench-left" title={leftCollapsed ? "展开设计素材" : "收起设计素材"} onClick={() => setLeftCollapsed((value) => !value)}>{leftCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
                    {headerStart}
                </div>
                <div className="canvas-workbench__header-end">
                    {headerEnd}
                    <button className="canvas-workbench__mobile-toggle" type="button" aria-label={mobilePanel === "right" ? "关闭方案面板" : "打开方案面板"} title={mobilePanel === "right" ? "关闭方案面板" : "打开方案面板"} onClick={() => setMobilePanel(mobilePanel === "right" ? null : "right")}>{mobilePanel === "right" ? <PanelRightClose /> : <PanelRightOpen />}</button>
                    <button className="canvas-workbench__desktop-toggle" type="button" aria-label={rightCollapsed ? "展开方案面板" : "收起方案面板"} aria-expanded={!rightCollapsed} aria-controls="canvas-workbench-right" title={rightCollapsed ? "展开方案面板" : "收起方案面板"} onClick={() => setRightCollapsed((value) => !value)}>{rightCollapsed ? <PanelRightOpen /> : <PanelRightClose />}</button>
                </div>
            </header>
            <div className="canvas-workbench__body">
                <aside id="canvas-workbench-left" className={`canvas-workbench__panel canvas-workbench__panel--left${leftCollapsed ? " is-collapsed" : ""}${mobilePanel === "left" ? " is-open" : ""}`} style={{ width: leftPanelWidth, background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>{leftPanel}</aside>
                {mobilePanel ? <button className="canvas-workbench__backdrop" type="button" aria-label="关闭侧边面板" onClick={() => setMobilePanel(null)} /> : null}
                <section className="canvas-workbench__canvas">{children}</section>
                <aside id="canvas-workbench-right" className={`canvas-workbench__panel canvas-workbench__panel--right${rightCollapsed ? " is-collapsed" : ""}${mobilePanel === "right" ? " is-open" : ""}`} style={{ width: rightPanelWidth, background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>{rightPanel}</aside>
            </div>
        </main>
    );
}
