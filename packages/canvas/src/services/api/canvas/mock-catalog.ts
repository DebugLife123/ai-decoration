import { CanvasApiError } from "../../../features/canvas/contracts";
import type { CanvasProjectAssetCatalog, CanvasProjectAssetRecord } from "../../project-asset-catalog";

type CatalogOperation = "read" | "save" | "remove";
type MockFailure = Error | (() => Error);

export type MockCanvasProjectAssetCatalogOptions = {
    projectId?: string;
    assets?: CanvasProjectAssetRecord[];
    failures?: Partial<Record<CatalogOperation, MockFailure>>;
};

export type MockCanvasProjectAssetCatalog = CanvasProjectAssetCatalog & {
    failNext(operation: CatalogOperation, error?: MockFailure): void;
};

function clone(asset: CanvasProjectAssetRecord): CanvasProjectAssetRecord {
    return structuredClone(asset);
}

function toError(failure: MockFailure | undefined): Error | undefined {
    if (!failure) return undefined;
    return typeof failure === "function" ? failure() : failure;
}

function assertAssetScope(projectId: string | undefined, asset: CanvasProjectAssetRecord) {
    if (projectId && asset.projectId !== projectId) throw new CanvasApiError("ASSET_PROJECT_MISMATCH", "素材不属于当前项目", { projectId: asset.projectId });
}

export function createMockCanvasProjectAssetCatalog(options: MockCanvasProjectAssetCatalogOptions = {}): MockCanvasProjectAssetCatalog {
    const records = new Map<string, CanvasProjectAssetRecord>();
    const failures = new Map<CatalogOperation, MockFailure>(Object.entries(options.failures || {}) as [CatalogOperation, MockFailure][]);
    for (const asset of options.assets || []) {
        assertAssetScope(options.projectId, asset);
        records.set(asset.assetId, clone(asset));
    }
    const takeFailure = (operation: CatalogOperation) => {
        const failure = failures.get(operation);
        failures.delete(operation);
        return toError(failure);
    };
    return {
        async readAll() {
            const error = takeFailure("read");
            if (error) throw error;
            return [...records.values()]
                .filter((asset) => !options.projectId || asset.projectId === options.projectId)
                .map(clone);
        },
        async save(assetId, asset) {
            const error = takeFailure("save");
            if (error) throw error;
            if (assetId !== asset.assetId) throw new CanvasApiError("ASSET_ID_MISMATCH", "素材目录 key 与 assetId 不匹配");
            assertAssetScope(options.projectId, asset);
            records.set(assetId, clone(asset));
        },
        async remove(assetId) {
            const error = takeFailure("remove");
            if (error) throw error;
            records.delete(assetId);
        },
        failNext(operation, error = new Error(`Mock ${operation} 失败`)) {
            failures.set(operation, error);
        },
    };
}
