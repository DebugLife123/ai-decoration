import type { CanvasAudioImporter, CanvasImageImporter, CanvasImportedAudio, CanvasImportedImage, CanvasImportedVideo, CanvasProjectAsset, CanvasVideoImporter } from "./contracts";
import { CanvasNodeType, type CanvasNodeData, type Position } from "../../types/canvas";
import { fitCanvasAssetNodeSize } from "../../lib/canvas/canvas-node-size";
import { canvasAssetMetadata } from "./asset-metadata";
import { getCanvasFileKind, type CanvasFileKind } from "./file-import-policy";

const VIDEO_NODE_MAX_SIZE = 420;
const AUDIO_NODE_SIZE = { width: 340, height: 120 };

export type CanvasFileImportHost = {
    projectId: string;
    mode: "local" | "mock";
    importImage: CanvasImageImporter;
    importVideo?: CanvasVideoImporter;
    importAudio?: CanvasAudioImporter;
};

export type CanvasImportedFile =
    | { kind: "image"; asset: CanvasImportedImage }
    | { kind: "video"; asset: CanvasImportedVideo }
    | { kind: "audio"; asset: CanvasImportedAudio };

export type CanvasImportedFileNode = { node: CanvasNodeData; opensDetails: boolean };

export type CanvasFileImportBatchItem = { file: File; position: Position };
export type CanvasFileImportBatchResult<T> =
    | (CanvasFileImportBatchItem & { status: "fulfilled"; value: T })
    | (CanvasFileImportBatchItem & { status: "rejected"; reason: unknown });

export type CanvasFileImportFailure = { fileName: string; message: string };
export type CanvasFileReplacementResult =
    | { status: "fulfilled"; nodeId: string; file: File; value: CanvasImportedFile }
    | { status: "rejected"; nodeId: string; file: File; reason: unknown };

export function resolveCanvasFileImportFailures<T>(
    results: CanvasFileImportBatchResult<T>[],
    isCanceled: (reason: unknown) => boolean,
    fallbackMessage: string,
): CanvasFileImportFailure[] {
    return results.flatMap((result) =>
        result.status === "rejected" && !isCanceled(result.reason)
            ? [{ fileName: result.file.name, message: result.reason instanceof Error ? result.reason.message : fallbackMessage }]
            : [],
    );
}

export async function runCanvasFileImportBatch<T>(items: CanvasFileImportBatchItem[], run: (file: File, position: Position) => Promise<T>): Promise<CanvasFileImportBatchResult<T>[]> {
    return Promise.all(items.map(async (item) => {
        try {
            return { ...item, status: "fulfilled" as const, value: await run(item.file, item.position) };
        } catch (reason) {
            return { ...item, status: "rejected" as const, reason };
        }
    }));
}

export async function runCanvasImportPlan<T>(
    plan: { replacement?: { nodeId: string; file: File }; items: CanvasFileImportBatchItem[] },
    host: CanvasFileImportHost,
    importNode: (file: File, position: Position) => Promise<T>,
    signal?: AbortSignal,
    onReplacement?: (result: CanvasFileReplacementResult) => void,
): Promise<{ replacement?: CanvasFileReplacementResult; items: CanvasFileImportBatchResult<T>[] }> {
    let replacement: CanvasFileReplacementResult | undefined;
    if (plan.replacement) {
        const { file, nodeId } = plan.replacement;
        try {
            replacement = { status: "fulfilled", nodeId, file, value: await importCanvasFile(host, file, signal) };
        } catch (reason) {
            replacement = { status: "rejected", nodeId, file, reason };
        }
        onReplacement?.(replacement);
    }

    const items = await runCanvasFileImportBatch(plan.items, importNode);
    return { replacement, items };
}

export function createCanvasImportedFileNode(id: string, title: string, center: Position, imported: CanvasImportedFile): CanvasNodeData {
    const type = imported.kind === "image" ? CanvasNodeType.Image : imported.kind === "video" ? CanvasNodeType.Video : CanvasNodeType.Audio;
    const size = imported.kind === "audio"
        ? AUDIO_NODE_SIZE
        : imported.kind === "video"
            ? fitCanvasAssetNodeSize(imported.asset.width, imported.asset.height, VIDEO_NODE_MAX_SIZE, VIDEO_NODE_MAX_SIZE)
            : fitCanvasAssetNodeSize(imported.asset.width, imported.asset.height);

    return {
        id,
        type,
        title,
        position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
        width: size.width,
        height: size.height,
        metadata: canvasAssetMetadata(imported.asset),
    };
}

export function replaceCanvasNodeWithImportedFile(node: CanvasNodeData, title: string, imported: CanvasImportedFile): CanvasNodeData {
    const next = createCanvasImportedFileNode(node.id, title, { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 }, imported);
    const keepOriginalPosition = imported.kind === "image";
    return {
        ...node,
        ...next,
        position: keepOriginalPosition ? node.position : next.position,
        metadata: imported.kind === "image"
            ? { ...node.metadata, ...next.metadata, errorDetails: undefined, freeResize: false, images: undefined, generationType: undefined, model: undefined, size: undefined, quality: undefined, count: undefined, references: undefined, primaryImageId: undefined }
            : next.metadata,
    };
}

export function replaceCanvasNodeInList(nodes: CanvasNodeData[], nodeId: string, title: string, imported: CanvasImportedFile): CanvasNodeData[] {
    return nodes.map((node) => (node.id === nodeId ? replaceCanvasNodeWithImportedFile(node, title, imported) : node));
}

function assertImportedKind(kind: CanvasFileKind, asset: CanvasProjectAsset) {
    const expected = kind === "image" ? "IMAGE" : kind === "video" ? "VIDEO" : "AUDIO";
    if (asset.kind !== expected) throw new Error("素材导入结果类型不匹配");
}

export async function importCanvasFile(host: CanvasFileImportHost, file: File, signal?: AbortSignal): Promise<CanvasImportedFile> {
    signal?.throwIfAborted();
    const kind = getCanvasFileKind(file);
    if (!kind) throw new Error("不支持的素材类型");
    const asset = kind === "image"
        ? await host.importImage(host.projectId, file, signal)
        : kind === "video"
            ? host.importVideo
                ? await host.importVideo(host.projectId, file, signal)
                : (() => { throw new Error("当前宿主未提供视频导入"); })()
            : host.importAudio
                ? await host.importAudio(host.projectId, file, signal)
                : (() => { throw new Error("当前宿主未提供音频导入"); })();

    signal?.throwIfAborted();
    if (asset.projectId !== host.projectId) throw new Error("上传结果不属于当前项目");
    assertImportedKind(kind, asset);
    return { kind, asset } as CanvasImportedFile;
}

export async function importCanvasFileAsNode(
    host: CanvasFileImportHost,
    file: File,
    position: Position,
    createId: (kind: CanvasFileKind) => string,
    signal?: AbortSignal,
): Promise<CanvasImportedFileNode> {
    const imported = await importCanvasFile(host, file, signal);
    return {
        node: createCanvasImportedFileNode(createId(imported.kind), file.name, position, imported),
        opensDetails: imported.kind !== "audio",
    };
}
