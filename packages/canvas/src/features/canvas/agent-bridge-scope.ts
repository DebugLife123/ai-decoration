export type CanvasAgentScope = { enabled: boolean; scopeKey: string };

export function isCanvasAgentScopeCurrent(active: CanvasAgentScope, expectedScopeKey: string) {
    return active.enabled && active.scopeKey === expectedScopeKey;
}
