import type { CanvasProjectAssetCatalog } from "./project-asset-catalog";

let catalog: CanvasProjectAssetCatalog | undefined;

export function configureCanvasProjectAssetCatalog(adapter: CanvasProjectAssetCatalog) {
    catalog = adapter;
}

export function getCanvasProjectAssetCatalog() {
    if (!catalog) throw new Error("画布项目素材目录宿主尚未配置");
    return catalog;
}
