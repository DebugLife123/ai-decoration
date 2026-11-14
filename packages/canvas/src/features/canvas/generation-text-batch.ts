import type { CanvasNodeData, CanvasNodeText } from "../../types/canvas";

export type CanvasTextBatchSummary = {
    allTexts: CanvasNodeText[];
    completedTexts: CanvasNodeText[];
    failedTexts: CanvasNodeText[];
    firstText?: CanvasNodeText;
};

export function summarizeCanvasTextBatch(results: Array<CanvasNodeText | null>): CanvasTextBatchSummary {
    const allTexts = results.filter((item): item is CanvasNodeText => Boolean(item));
    const completedTexts = allTexts.filter((item) => item.status === "success");
    const failedTexts = allTexts.filter((item) => item.status === "error");
    return { allTexts, completedTexts, failedTexts, firstText: completedTexts[0] };
}

export function applyCanvasTextBatchSummary(
    nodes: CanvasNodeData[],
    options: {
        rootNodeId: string;
        configNodeId?: string;
        summary: CanvasTextBatchSummary;
        primaryTextId?: string;
        partialFailureMessage: string;
        generationFailureMessage: string;
    },
): CanvasNodeData[] {
    const { allTexts, completedTexts, failedTexts, firstText } = options.summary;
    return nodes.map((node) => {
        if (node.id === options.rootNodeId) {
            const primaryText = completedTexts.find((text) => text.id === node.metadata?.primaryTextId) || firstText;
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    content: primaryText?.content || "",
                    texts: allTexts,
                    primaryTextId: primaryText?.id,
                    status: primaryText ? ("success" as const) : ("error" as const),
                    errorDetails: failedTexts.length ? options.partialFailureMessage : primaryText ? undefined : options.generationFailureMessage,
                },
            };
        }
        return node.id === options.configNodeId
            ? { ...node, metadata: { ...node.metadata, status: firstText ? ("success" as const) : ("error" as const), errorDetails: firstText ? undefined : options.generationFailureMessage } }
            : node;
    });
}
