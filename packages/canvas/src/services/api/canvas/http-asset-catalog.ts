import type { CanvasAssetCatalogApi } from "../../../features/canvas/contracts";
import { createCanvasHttpAdapter, type CanvasHttpAdapterOptions } from "./http-adapter";

/**
 * Read-only HTTP catalog facade. Uploading, task submission and version writes
 * remain on the full CanvasApi so hosts can migrate browsing independently.
 */
export function createCanvasHttpAssetCatalog(options: CanvasHttpAdapterOptions): CanvasAssetCatalogApi {
    const api = createCanvasHttpAdapter(options);
    return { listAssets: api.listAssets, getAsset: api.getAsset };
}
