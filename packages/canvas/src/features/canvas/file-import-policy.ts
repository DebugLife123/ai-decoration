import { isAudioFile } from "../../lib/media-file";
import type { Position } from "../../types/canvas";

export type CanvasFileKind = "image" | "video" | "audio";

export function getCanvasFileKind(file: File): CanvasFileKind | null {
    if (isAudioFile(file)) return "audio";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "image";
    return null;
}

export function matchesCanvasFileKind(file: File, expected: CanvasFileKind): boolean {
    return getCanvasFileKind(file) === expected;
}

export function filterCanvasImportFiles(files: Iterable<File>) {
    return Array.from(files).filter((file) => getCanvasFileKind(file) !== null);
}

export function getCanvasImportPositions(base: Position, count: number, startIndex = 0): Position[] {
    return Array.from({ length: count }, (_, index) => {
        const order = startIndex + index;
        const column = order % 3;
        const row = Math.floor(order / 3);
        return { x: base.x + column * 560, y: base.y + row * 400 };
    });
}

export type CanvasImportPlanItem = { file: File; position: Position };
export type CanvasImportPlan = {
    replacement?: { nodeId: string; file: File };
    items: CanvasImportPlanItem[];
};

export function createCanvasImportPlan(files: File[], base: Position, replacementNodeId?: string): CanvasImportPlan | null {
    if (!files.length) return null;
    if (replacementNodeId) {
        const [replacement, ...rest] = files;
        const positions = getCanvasImportPositions(base, rest.length, 1);
        return {
            replacement: { nodeId: replacementNodeId, file: replacement },
            items: rest.map((file, index) => ({ file, position: positions[index] })),
        };
    }
    const positions = getCanvasImportPositions(base, files.length);
    return { items: files.map((file, index) => ({ file, position: positions[index] })) };
}
