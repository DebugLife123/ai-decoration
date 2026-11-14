export type CanvasProjectLoadIdentity = { projectId: string; attempt: number };

export function isCanvasProjectReady(loaded: boolean, requested: CanvasProjectLoadIdentity, completed: CanvasProjectLoadIdentity | null) {
    return loaded && completed?.projectId === requested.projectId && completed.attempt === requested.attempt;
}
