export type CanvasNodeSelectionResult = {
    nextSelected: Set<string>;
    soloId: string | null;
};

export function selectCanvasNode(
    selectedIds: ReadonlySet<string>,
    nodeId: string,
    additive: boolean,
): CanvasNodeSelectionResult {
    const nextSelected = new Set(selectedIds);
    if (additive) {
        if (nextSelected.has(nodeId)) nextSelected.delete(nodeId);
        else nextSelected.add(nodeId);
    } else if (!nextSelected.has(nodeId)) {
        nextSelected.clear();
        nextSelected.add(nodeId);
    }

    return {
        nextSelected,
        soloId: nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null,
    };
}
