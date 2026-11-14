export type CanvasModelEntry = { name: string; script?: string };
export type CanvasModelChannel = { id: string; models: CanvasModelEntry[] };

export const CANVAS_CHANNEL_MODEL_SEPARATOR = "::";

export function encodeCanvasModel(channelId: string, model: string) {
    return `${channelId}${CANVAS_CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function decodeCanvasModel(value: string) {
    const index = value.indexOf(CANVAS_CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CANVAS_CHANNEL_MODEL_SEPARATOR.length) };
}

export function canvasModelName(value: string) {
    return decodeCanvasModel(value)?.model || value;
}

export function resolveCanvasModelEntry(channels: CanvasModelChannel[], value: string) {
    const decoded = decodeCanvasModel(value);
    const model = decoded?.model || value;
    const channel = decoded ? channels.find((item) => item.id === decoded.channelId) : channels.find((item) => item.models.some((entry) => entry.name === model));
    const entry = channel?.models.find((item) => item.name === model);
    return channel && entry ? { channelId: channel.id, entry: { name: entry.name, ...(entry.script ? { script: entry.script } : {}) } } : null;
}

export function canvasModelScript(channels: CanvasModelChannel[], value: string) {
    return resolveCanvasModelEntry(channels, value)?.entry.script?.trim() || "";
}
