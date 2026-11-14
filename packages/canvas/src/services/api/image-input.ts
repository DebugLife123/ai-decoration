import type { ReferenceImage } from "../../types/image";
import { getProviderMediaPersistence } from "../provider-media-persistence";
import { readHostImage, type ImageInputOptions } from "./image-read";

export type { ImageInputOptions } from "./image-read";

export async function readRequestImage(image: ReferenceImage, options?: ImageInputOptions) {
    options?.signal?.throwIfAborted();
    if (options?.readImage) return readHostImage(image, { ...options, readImage: options.readImage });
    const dataUrl = await (await getProviderMediaPersistence()).readImage(image, options?.signal);
    options?.signal?.throwIfAborted();
    return dataUrl;
}
