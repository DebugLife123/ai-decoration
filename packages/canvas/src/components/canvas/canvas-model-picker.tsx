import { useEffect, useId, useState } from "react";
import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CanvasGenerationPreferences, CanvasModelCapability } from "../../features/canvas/generation-preferences";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";
import { cn } from "../../lib/utils";

type CanvasModelPickerProps = {
    preferences: CanvasGenerationPreferences;
    value: string;
    capability: CanvasModelCapability;
    onChange: (model: string) => void;
    onMissingConfig?: () => void;
    className?: string;
};

export function CanvasModelPicker({ preferences, value, capability, onChange, onMissingConfig, className }: CanvasModelPickerProps) {
    const { t } = useTranslation();
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const options = preferences.models[capability];
    const current = options.find((option) => option.value === value);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select open={open} value={value} onOpenChange={(nextOpen) => {
            if (nextOpen && !options.length) onMissingConfig?.();
            if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
            setOpen(nextOpen);
        }} onValueChange={onChange}>
            <SelectTrigger className={cn("canvas-composer-model-picker h-8 w-fit max-w-full min-w-[9rem] justify-start gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal", className)} title={current?.label || value || t("settingsPanels.model.select")}>
                {current?.value ? <ModelIcon model={current.value} /> : <Cpu className="size-4 shrink-0 opacity-70" />}
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current?.label || value || t("settingsPanels.model.select")}</span>
            </SelectTrigger>
            <SelectContent data-canvas-no-zoom className="z-[1200] w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl" position="popper" align="start">
                {options.length ? options.map((option) => <SelectItem key={option.value} value={option.value} textValue={option.label}>{option.label}</SelectItem>) : (
                    <SelectItem value="__empty__" disabled>{t("settingsPanels.model.addFirst")}</SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

function ModelIcon({ model }: { model: string }) {
    const name = model.toLowerCase();
    const icon = name.includes("claude") || name.includes("anthropic") ? "claude" : name.includes("gemini") || name.includes("google") ? "gemini" : name.includes("gpt") || name.includes("openai") ? "openai" : name.includes("grok") ? "grok" : name.includes("deepseek") ? "deepseek" : name.includes("glm") ? "glm" : "";
    return icon ? <img src={`/icons/${icon}.svg`} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}
