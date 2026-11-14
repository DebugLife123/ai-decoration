import type { CanvasAudioAsset, CanvasImageAsset, CanvasProjectAsset, CanvasVideoAsset } from "./contracts";

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string }
    | { kind: "image"; dataUrl: string; title: string; storageKey?: string; asset?: CanvasImageAsset }
    | { kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number; asset?: CanvasVideoAsset }
    | { kind: "audio"; title: string; asset: CanvasAudioAsset };

export const CANVAS_ASSET_DRAG_MIME = "application/x-infinite-canvas-asset";

export type CanvasAssetDragData = { projectId: string; assetId: string };

export function serializeCanvasAssetDragData(data: CanvasAssetDragData) {
    return JSON.stringify(data);
}

export function parseCanvasAssetDragData(value: string): CanvasAssetDragData | null {
    try {
        const data = JSON.parse(value) as Partial<CanvasAssetDragData>;
        if (typeof data.projectId !== "string" || typeof data.assetId !== "string" || !data.projectId || !data.assetId) return null;
        return { projectId: data.projectId, assetId: data.assetId };
    } catch {
        return null;
    }
}

// Browser selection boundary, separate from project-owned HTTP asset DTOs.
export type CanvasLibraryItem = {
    id: string;
    title: string;
    cover: string;
    searchText: string;
    groupId?: string;
    subtitle?: string;
    payload: InsertAssetPayload;
};

export type CanvasLibrarySource = {
    id: string;
    label: string;
    loading?: boolean;
    groups?: { value: string; label: string }[];
    items: CanvasLibraryItem[];
    /** Optional owner command. Project sources may expose deletion; global catalogs do not. */
    remove?: (assetId: string) => Promise<void>;
};

export type CanvasAssetLibrary = {
    list(): Promise<CanvasLibrarySource[]>;
    subscribe?: (onChange: () => void) => () => void;
};

export function createProjectAssetLibrary(api: { listAssets(projectId: string): Promise<CanvasProjectAsset[]>; deleteAsset?: (projectId: string, assetId: string) => Promise<void> }, projectId: string): CanvasAssetLibrary {
    return {
        async list() {
            const assets = await api.listAssets(projectId);
            if (assets.some((asset) => asset.projectId !== projectId)) throw new Error("素材不属于当前项目");
            return [{
                id: "project", label: "项目素材",
                ...(api.deleteAsset ? { remove: (assetId: string) => api.deleteAsset!(projectId, assetId) } : {}),
                items: assets.map((asset) => ({
                    id: asset.assetId, title: asset.name, cover: asset.kind === "IMAGE" ? asset.url : "", searchText: asset.name,
                    payload: asset.kind === "IMAGE"
                        ? { kind: "image", dataUrl: asset.url, title: asset.name, asset }
                        : asset.kind === "VIDEO"
                            ? { kind: "video", url: asset.url, title: asset.name, width: asset.width, height: asset.height, storageKey: asset.storageRef?.key, asset }
                            : { kind: "audio", title: asset.name, asset },
                })),
            }];
        },
    };
}
