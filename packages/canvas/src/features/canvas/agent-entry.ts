const AGENT_ENTRY_MODES = new Set(["new", "recent", "choose"]);

export type CanvasAgentEntry = {
    projectId: string;
    mode: string | null;
    hasCustomBootstrap: boolean;
    enabled: boolean;
};

export function claimCanvasAgentAutoOpen(entry: CanvasAgentEntry, openedEntries: Set<string>) {
    if (!entry.projectId || !entry.mode || !AGENT_ENTRY_MODES.has(entry.mode) || entry.hasCustomBootstrap || entry.enabled) return false;
    const key = JSON.stringify([entry.projectId, entry.mode]);
    if (openedEntries.has(key)) return false;
    openedEntries.add(key);
    return true;
}
