import type { CanvasApi } from "../../../features/canvas/contracts";
import { createApiCanvasHostAdapters, type CanvasHostAdapterBundle } from "../../../features/canvas/api-host-adapters";
import { createCanvasHttpAdapter, createCanvasHttpBinaryUploader, type CanvasHttpAdapterOptions } from "./http-adapter";

export function createCanvasHttpHostAdapters(options: CanvasHttpAdapterOptions): CanvasHostAdapterBundle & { api: CanvasApi; uploads: NonNullable<CanvasHostAdapterBundle["uploads"]> } {
    const api = createCanvasHttpAdapter(options);
    return createApiCanvasHostAdapters(api, { uploadBinary: createCanvasHttpBinaryUploader(options.fetch) }) as CanvasHostAdapterBundle & { api: CanvasApi; uploads: NonNullable<CanvasHostAdapterBundle["uploads"]> };
}
