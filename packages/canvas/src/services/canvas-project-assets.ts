import { nanoid } from "nanoid";
import type { CanvasImportedAudio, CanvasImportedImage, CanvasImportedVideo } from "../features/canvas/contracts";
import type { CanvasProjectAssetCatalog, CanvasProjectAssetRecord } from "./project-asset-catalog";
import { getCanvasProjectAssetCatalog } from "./canvas-project-asset-catalog";
import { getCanvasProjectAssetStorage } from "./canvas-project-asset-storage";
import { CanvasApiError } from "../features/canvas/contracts";

type ImportedAsset = CanvasImportedImage | CanvasImportedVideo | CanvasImportedAudio;
export type StoredProjectAsset = CanvasProjectAssetRecord;
export type CanvasProjectAssetCleanupData = { projects: { id: string }[]; assets: unknown; extra?: unknown; projectAssets: StoredProjectAsset[] };
export type CanvasProjectAssetCleanupSteps = {
    cleanupImages: (data: CanvasProjectAssetCleanupData) => Promise<void>;
    cleanupMedia: (data: CanvasProjectAssetCleanupData) => Promise<void>;
};
const listeners = new Set<() => void>();
let pending: Promise<unknown> = Promise.resolve();

// Keep project imports and media cleanup ordered in this browser context.
function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
}

export function subscribeProjectAssets(onChange: () => void) {
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
}

async function saveAsset<T extends ImportedAsset>(asset: T, projectExists: () => boolean, catalog: CanvasProjectAssetCatalog, storage: ReturnType<typeof getCanvasProjectAssetStorage>, signal?: AbortSignal): Promise<T> {
    try {
        signal?.throwIfAborted();
        if (!asset.storageKey) throw new Error("素材未保存到本地");
        if (!projectExists()) throw new Error("项目不存在");
        const { url: _url, ...metadata } = asset;
        await catalog.save(asset.assetId, metadata as StoredProjectAsset);
        signal?.throwIfAborted();
        if (!projectExists()) throw new Error("项目不存在");
    } catch (error) {
        // Do not delete a blob if removing its potentially written catalog record fails.
        await catalog.remove(asset.assetId);
        if (asset.storageKey) await (asset.kind === "IMAGE" ? storage.deleteImages : storage.deleteMedia)([asset.storageKey]);
        throw error;
    }
    listeners.forEach((listener) => listener());
    return asset;
}

export function importProjectImage(projectId: string, file: File, projectExists: () => boolean, catalog?: CanvasProjectAssetCatalog, signal?: AbortSignal): Promise<CanvasImportedImage> {
    return exclusive(async () => {
        signal?.throwIfAborted();
        const storage = getCanvasProjectAssetStorage();
        const projectCatalog = catalog ?? getCanvasProjectAssetCatalog();
        if (!projectExists()) throw new Error("项目不存在");
        if (!file.type.startsWith("image/")) throw new Error("当前素材契约仅接收图片");
        const image = await storage.uploadImage(file, signal);
        return saveAsset({ ...image, assetId: nanoid(), projectId, name: file.name, kind: "IMAGE", createdAt: new Date().toISOString() }, projectExists, projectCatalog, storage, signal);
    });
}

export function importProjectVideo(projectId: string, file: File, projectExists: () => boolean, catalog?: CanvasProjectAssetCatalog, signal?: AbortSignal): Promise<CanvasImportedVideo> {
    return exclusive(async () => {
        signal?.throwIfAborted();
        const storage = getCanvasProjectAssetStorage();
        const projectCatalog = catalog ?? getCanvasProjectAssetCatalog();
        if (!projectExists()) throw new Error("项目不存在");
        const video = await storage.uploadVideo(file, signal);
        return saveAsset({ ...video, assetId: nanoid(), projectId, name: file.name, kind: "VIDEO", createdAt: new Date().toISOString() }, projectExists, projectCatalog, storage, signal);
    });
}

export function listProjectAssets(projectId: string, catalog?: CanvasProjectAssetCatalog): Promise<ImportedAsset[]> {
    return exclusive(async () => {
        const storage = getCanvasProjectAssetStorage();
        const projectCatalog = catalog ?? getCanvasProjectAssetCatalog();
        return Promise.all((await projectCatalog.readAll()).filter((asset) => asset.projectId === projectId).map(async (asset) => {
        const url = await (asset.kind === "IMAGE" ? storage.resolveImage : storage.resolveMedia)(asset.storageKey);
        if (!url) throw new Error(`项目素材文件不存在：${asset.name}`);
        return { ...asset, url };
        }));
    });
}

export function deleteProjectAsset(projectId: string, assetId: string, isReferenced: (assetId: string) => boolean, catalog?: CanvasProjectAssetCatalog, storage?: ReturnType<typeof getCanvasProjectAssetStorage>): Promise<void> {
    return exclusive(async () => {
        const projectCatalog = catalog ?? getCanvasProjectAssetCatalog();
        const projectStorage = storage ?? getCanvasProjectAssetStorage();
        const asset = (await projectCatalog.readAll()).find((item) => item.assetId === assetId);
        if (!asset || asset.projectId !== projectId) throw new CanvasApiError("ASSET_PROJECT_MISMATCH", "素材不属于当前项目");
        if (isReferenced(assetId)) throw new CanvasApiError("ASSET_IN_USE", "素材仍被画布或版本引用，不能删除", { projectId, assetId });
        await projectCatalog.remove(assetId);
        try {
            await (asset.kind === "IMAGE" ? projectStorage.deleteImages : projectStorage.deleteMedia)([asset.storageKey]);
        } catch (error) {
            await projectCatalog.save(assetId, asset).catch(() => undefined);
            throw error;
        }
        listeners.forEach((listener) => listener());
    });
}

export function importProjectAudio(projectId: string, file: File, projectExists: () => boolean, catalog?: CanvasProjectAssetCatalog, signal?: AbortSignal): Promise<CanvasImportedAudio> {
    return exclusive(async () => {
        signal?.throwIfAborted();
        const storage = getCanvasProjectAssetStorage();
        const projectCatalog = catalog ?? getCanvasProjectAssetCatalog();
        if (!projectExists()) throw new Error("项目不存在");
        const audio = await storage.uploadAudio(file, signal);
        return saveAsset({ ...audio, assetId: nanoid(), projectId, name: file.name, kind: "AUDIO", createdAt: new Date().toISOString() }, projectExists, projectCatalog, storage, signal);
    });
}

export function cleanupProjectAssets(getUsedData: () => Omit<CanvasProjectAssetCleanupData, "projectAssets">, steps: CanvasProjectAssetCleanupSteps, catalog?: CanvasProjectAssetCatalog) {
    return exclusive(async () => {
        const projectCatalog = catalog ?? getCanvasProjectAssetCatalog();
        const assets = await projectCatalog.readAll();
        const usedData = getUsedData();
        const projectIds = new Set(usedData.projects.map((project) => project.id));
        const removed = assets.filter((asset) => !projectIds.has(asset.projectId));
        await Promise.all(removed.map((asset) => projectCatalog.remove(asset.assetId)));
        if (removed.length) listeners.forEach((listener) => listener());
        const projectAssets = assets.filter((asset) => projectIds.has(asset.projectId));
        const readCleanupData = (): CanvasProjectAssetCleanupData => {
            const latest = getUsedData();
            const liveProjectIds = new Set(latest.projects.map((project) => project.id));
            return { ...latest, projectAssets: projectAssets.filter((asset) => liveProjectIds.has(asset.projectId)) };
        };
        await steps.cleanupImages(readCleanupData());
        await steps.cleanupMedia(readCleanupData());
    });
}
