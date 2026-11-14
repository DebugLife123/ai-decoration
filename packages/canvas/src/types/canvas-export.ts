import type { CanvasProject } from "../stores/canvas/use-canvas-store";

export type CanvasExportFile = {
    app: "infinite-canvas";
    version: 3;
    exportedAt: string;
    projects: CanvasProjectExportItem[];
};

export type CanvasProjectExportItem = {
    project: CanvasProject;
    files: CanvasExportAsset[];
};

export type CanvasExportAsset = {
    storageKey: string;
    path: string;
    mimeType: string;
    bytes: number;
};

export type CanvasResultExportManifest = {
    app: "infinite-canvas-results";
    version: 1;
    exportedAt: string;
    projectId: string;
    skippedCount: number;
    items: CanvasResultExportItem[];
};

export type CanvasResultExportItem = {
    name: string;
    path: string;
    mimeType: string;
    taskId: string | null;
    assetId: string | null;
    versionId: string | null;
};
