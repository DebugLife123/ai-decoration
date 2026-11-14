import { useCallback } from "react";
import type { CanvasConfigAccess } from "./canvas-host";

export function useCanvasConfigAccess({
    mode,
    config,
    notify,
}: {
    mode: "local" | "mock";
    config?: CanvasConfigAccess;
    notify: (message: string) => void;
}) {
    const isReady = useCallback((model: string) => mode !== "mock" && Boolean(config?.isReady(model)), [config, mode]);
    const openSettings = useCallback((shouldPromptContinue = false) => {
        if (mode === "mock") {
            notify("请在右侧方案设计面板提交空间生成任务");
            return;
        }
        if (!config) {
            notify("当前宿主未提供 AI 配置入口");
            return;
        }
        config.openSettings(shouldPromptContinue);
    }, [config, mode, notify]);
    return { isReady, openSettings };
}
