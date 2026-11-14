export type CanvasGenerationAttempt =
    | { status: "succeeded" }
    | { status: "failed"; errorDetails: string }
    | { status: "canceled" };

export type CanvasGenerationBatchSummary = {
    hasSuccess: boolean;
    hasFailure: boolean;
    firstError?: string;
};

export function summarizeCanvasGenerationBatch(attempts: CanvasGenerationAttempt[]): CanvasGenerationBatchSummary {
    const failed = attempts.filter((attempt): attempt is Extract<CanvasGenerationAttempt, { status: "failed" }> => attempt.status === "failed");
    return {
        hasSuccess: attempts.some((attempt) => attempt.status === "succeeded"),
        hasFailure: failed.length > 0,
        firstError: failed[0]?.errorDetails,
    };
}
