import type { ReferenceImage } from "../../types/image";

export type ImageInputOptions = {
    signal?: AbortSignal;
    readImage?: (image: ReferenceImage) => Promise<string>;
};

export type ResolvedImageInputOptions = Omit<ImageInputOptions, "readImage"> & { readImage: NonNullable<ImageInputOptions["readImage"]> };

export async function readHostImage(image: ReferenceImage, options: ResolvedImageInputOptions) {
    options.signal?.throwIfAborted();
    const dataUrl = await options.readImage(image);
    options.signal?.throwIfAborted();
    return dataUrl;
}
