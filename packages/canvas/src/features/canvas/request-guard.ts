export type CanvasRequestToken = {
    projectId: string;
    taskId?: string;
    sequence: number;
};

export function createCanvasRequestGuard() {
    let sequence = 0;

    return {
        begin(projectId: string, taskId?: string): CanvasRequestToken {
            return { projectId, taskId, sequence: ++sequence };
        },
        invalidate() {
            sequence += 1;
        },
        isCurrent(token: CanvasRequestToken, projectId: string, taskId?: string) {
            return token.sequence === sequence && token.projectId === projectId && (token.taskId === undefined || token.taskId === taskId);
        },
    };
}
