export function isVideoTaskFailed(error: unknown) {
    return error instanceof Error && error.name === "VideoTaskFailed";
}

export function isVideoTaskTimeout(error: unknown) {
    return error instanceof Error && error.name === "VideoTaskTimeout";
}
