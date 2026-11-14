export const AGNES_VIDEO_WIDTH = 1152;
export const AGNES_VIDEO_HEIGHT = 768;
export const AGNES_VIDEO_FRAME_RATE = 24;

export function isAgnesVideoModel(model: string) {
    return model.toLowerCase().includes("agnes");
}

export function isAgnesBaseUrl(baseUrl: string) {
    return baseUrl.toLowerCase().includes("agnes");
}

export function normalizeAgnesDuration(value: string) {
    return Number(value) === 5 ? 5 : 2;
}

export function agnesFrameCount(durationSeconds: number) {
    return Math.max(25, Math.round(durationSeconds * AGNES_VIDEO_FRAME_RATE) + 1);
}

export function agnesVideoRequestError(references: unknown[] = [], videoReferences: unknown[] = [], audioReferences: unknown[] = []) {
    return references.length || videoReferences.length || audioReferences.length ? "Agnes 当前只支持文生视频，请移除参考图片、视频和音频" : "";
}
