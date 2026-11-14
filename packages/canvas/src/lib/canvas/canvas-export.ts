import { saveAs } from "file-saver";

import i18n from "../../i18n";
import { createZip } from "../zip";
import type { CanvasExportAsset, CanvasExportFile, CanvasResultExportItem, CanvasResultExportManifest } from "../../types/canvas-export";
import type { CanvasProject } from "../../stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";

export type CanvasExportMediaReference = { name: string; type?: string; url?: string; dataUrl?: string; storageKey?: string; assetId?: string };
export type CanvasExportMediaReader = (projectId: string, reference: CanvasExportMediaReference) => Promise<Blob | null>;

export async function exportCanvasProjects(projects: CanvasProject[], fileName: string, readMedia: CanvasExportMediaReader) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const exportedProjects = await Promise.all(
        projects.map(async (project) => {
            const files: CanvasExportAsset[] = [];
            await Promise.all(
                collectStorageKeys(project).map(async (storageKey) => {
                    const blob = await readMedia(project.id, { name: storageKey, storageKey });
                    if (!blob) return;
                    const path = `projects/${project.id}/files/${safeFileName(storageKey)}.${fileExtension(blob.type, storageKey)}`;
                    files.push({ storageKey, path, mimeType: blob.type || "application/octet-stream", bytes: blob.size });
                    zipFiles.push({ name: path, data: blob });
                }),
            );
            return { project, files };
        }),
    );

    const data: CanvasExportFile = { app: "infinite-canvas", version: 3, exportedAt: new Date().toISOString(), projects: exportedProjects };
    const zip = await createZip([{ name: "projects.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

export async function exportCanvasNodes(nodes: CanvasNodeData[], fileName: string, projectId: string, readMedia: CanvasExportMediaReader) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const used = new Set<string>();
    const uniqueName = (base: string, ext: string) => {
        const safe = safeFileName(base) || i18n.t("canvas.export.item");
        let name = `${safe}.${ext}`;
        for (let i = 1; used.has(name); i += 1) name = `${safe}-${i}.${ext}`;
        used.add(name);
        return name;
    };

    await Promise.all(
        nodes.map(async (node) => {
            const title = node.title || node.type;
            const storageKey = node.metadata?.storageKey || "";
            if (storageKey) {
                const blob = await readMedia(projectId, { name: title, type: node.metadata?.mimeType, url: node.metadata?.content, storageKey, assetId: node.metadata?.assetId });
                if (blob) return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            }
            if (node.type === CanvasNodeType.Text) return void zipFiles.push({ name: uniqueName(title, "txt"), data: node.metadata?.content || node.metadata?.prompt || "" });
            const content = node.metadata?.content;
            if (content && content.startsWith("data:")) {
                const blob = await readMedia(projectId, { name: title, type: node.metadata?.mimeType, url: content, dataUrl: content });
                if (!blob) return;
                return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            }
            zipFiles.push({ name: uniqueName(title, "json"), data: JSON.stringify(node, null, 2) });
        }),
    );

    const zip = await createZip(zipFiles);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

export async function exportCanvasResults(nodes: CanvasNodeData[], fileName: string, projectId: string, readMedia: CanvasExportMediaReader) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const manifestItems: CanvasResultExportItem[] = [];
    let skippedCount = 0;
    const usedNames = new Set<string>(["result-manifest.json"]);
    const usedStems = new Set<string>(["result-manifest"]);
    const uniqueName = (base: string, ext: string) => {
        const safe = safeFileName(base) || i18n.t("canvas.export.item");
        let stem = safe;
        for (let i = 1; usedStems.has(stem.toLowerCase()) || usedNames.has(`${stem}.${ext}`.toLowerCase()); i += 1) stem = `${safe}-${i}`;
        const name = `${stem}.${ext}`;
        usedStems.add(stem.toLowerCase());
        usedNames.add(name.toLowerCase());
        return name;
    };
    const addManifestItem = (item: CanvasResultExportItem) => manifestItems.push(item);
    const addMedia = async (title: string, content: string, reference: Omit<CanvasExportMediaReference, "name"> & { name?: string }, identity: Pick<CanvasResultExportItem, "taskId" | "assetId" | "versionId">) => {
        let blob: Blob | null = null;
        try {
            if (content) blob = await readMedia(projectId, { ...reference, name: reference.name || title, url: reference.url || content, dataUrl: content });
        } catch {
            skippedCount += 1;
            return false;
        }
        if (!blob) {
            skippedCount += 1;
            return false;
        }
        const path = uniqueName(title, fileExtension(blob.type, reference.storageKey || ""));
        zipFiles.push({ name: path, data: blob });
        addManifestItem({ name: title, path, mimeType: blob.type || reference.type || "application/octet-stream", ...identity, assetId: identity.assetId || reference.assetId || null });
        return true;
    };

    for (const node of nodes) {
        if (!isGeneratedResult(node)) continue;
        const title = node.title || node.type;
        if (node.type === CanvasNodeType.Image && node.metadata?.images?.length) {
            for (const [index, image] of node.metadata.images.entries()) {
                if (image.status !== "success") continue;
                if (image.content) await addMedia(`${title}-${index + 1}`, image.content, { storageKey: image.storageKey, assetId: image.assetId, dataUrl: image.content, type: image.mimeType }, { taskId: node.metadata.taskId || null, assetId: image.assetId || node.metadata.assetId || null, versionId: node.metadata.versionId || null });
                else skippedCount += 1;
            }
            continue;
        }
        if (node.type === CanvasNodeType.Text && node.metadata?.texts?.length) {
            for (const [index, item] of node.metadata.texts.entries()) {
                if (item.status !== "success") continue;
                if (item.content) {
                    const name = `${title}-${index + 1}`;
                    const path = uniqueName(name, "txt");
                    zipFiles.push({ name: path, data: item.content });
                    addManifestItem({ name, path, mimeType: "text/plain", taskId: node.metadata.taskId || null, assetId: node.metadata.assetId || null, versionId: node.metadata.versionId || null });
                }
                else skippedCount += 1;
            }
            continue;
        }
        if (node.metadata?.status !== "success") continue;
        if (!node.metadata.content) {
            skippedCount += 1;
            continue;
        }
        if (node.type === CanvasNodeType.Text) {
            const path = uniqueName(title, "txt");
            zipFiles.push({ name: path, data: node.metadata.content });
            addManifestItem({ name: title, path, mimeType: "text/plain", taskId: node.metadata.taskId || null, assetId: node.metadata.assetId || null, versionId: node.metadata.versionId || null });
            continue;
        }
        if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) {
            await addMedia(title, node.metadata.content, { storageKey: node.metadata.storageKey, assetId: node.metadata.assetId, url: node.metadata.content, type: node.metadata.mimeType }, { taskId: node.metadata.taskId || null, assetId: node.metadata.assetId || null, versionId: node.metadata.versionId || null });
        }
    }

    if (zipFiles.length) {
        const manifest: CanvasResultExportManifest = { app: "infinite-canvas-results", version: 1, exportedAt: new Date().toISOString(), projectId, skippedCount, items: manifestItems };
        const resultZip = await createZip([{ name: "result-manifest.json", data: JSON.stringify(manifest, null, 2) }, ...zipFiles]);
        saveAs(resultZip, `${safeFileName(fileName)}.zip`);
    }
    return { exportedCount: zipFiles.length, skippedCount };
}

function isGeneratedResult(node: CanvasNodeData) {
    return Boolean(node.metadata?.taskId || node.metadata?.model || node.metadata?.generationType || node.metadata?.generationMode || node.metadata?.videoTaskId);
}

function collectStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return [...keys];
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectStorageKeys(child, keys)) : collectStorageKeys(item, keys)));
    return [...keys];
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, storageKey: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("json")) return "json";
    if (mimeType.includes("text")) return "txt";
    return storageKey.startsWith("image:") ? "png" : "bin";
}
