import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type CanvasNodeTypeId } from "../../types/canvas";

export type CanvasGeneratedMediaPlan = {
    sourceNodeId: string;
    nodeId: string;
    type: CanvasNodeTypeId;
    reusesSource: boolean;
    node: CanvasNodeData;
};

export function createCanvasGeneratedMediaPlan(input: {
    nodeId: string;
    sourceNode?: CanvasNodeData;
    type: typeof CanvasNodeType.Video | typeof CanvasNodeType.Audio;
    prompt: string;
    size: { width: number; height: number };
    metadata: CanvasNodeMetadata;
    createId: () => string;
}): CanvasGeneratedMediaPlan {
    const { nodeId, sourceNode, type, prompt, size, metadata, createId } = input;
    const reusesSource = sourceNode?.type === type && !sourceNode.metadata?.content;
    const generatedId = reusesSource ? nodeId : createId();
    const parent = sourceNode?.position || { x: 0, y: 0 };
    const sourceSize = { width: sourceNode?.width || size.width, height: sourceNode?.height || size.height };
    const node: CanvasNodeData = {
        id: generatedId,
        type,
        title: prompt.slice(0, 32) || (type === CanvasNodeType.Video ? "Generated Video" : "Generated Audio"),
        position: reusesSource
            ? parent
            : {
                  x: parent.x + sourceSize.width + 96,
                  y: type === CanvasNodeType.Audio ? parent.y + (sourceSize.height - size.height) / 2 : parent.y,
              },
        width: reusesSource ? sourceSize.width : size.width,
        height: reusesSource ? sourceSize.height : size.height,
        metadata: { ...metadata, prompt, status: "loading" },
    };
    return { sourceNodeId: nodeId, nodeId: generatedId, type, reusesSource, node };
}

export function applyCanvasGeneratedMediaPlan(nodes: CanvasNodeData[], plan: CanvasGeneratedMediaPlan): CanvasNodeData[] {
    return plan.reusesSource
        ? nodes.map((node) => (node.id === plan.sourceNodeId ? { ...node, ...plan.node } : node))
        : [...nodes.map((node) => (node.id === plan.sourceNodeId ? { ...node, metadata: { ...node.metadata, status: "success" as const } } : node)), plan.node];
}
