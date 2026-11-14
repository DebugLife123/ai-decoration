export type CanvasGenerationOutcome =
    | { kind: "canceled" }
    | { kind: "failed"; message: string };

export function resolveCanvasGenerationOutcome(
    error: unknown,
    signal: AbortSignal | undefined,
    fallbackMessage: string,
    isCanceled: (error: unknown) => boolean,
): CanvasGenerationOutcome {
    if (signal?.aborted || isCanceled(error)) return { kind: "canceled" };
    return { kind: "failed", message: error instanceof Error ? error.message : fallbackMessage };
}
