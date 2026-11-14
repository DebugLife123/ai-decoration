import type { CanvasNodeData } from "../../types/canvas";
import type { CanvasTaskExecution } from "../../services/api/canvas/task-workflow";
import type { CanvasHostTaskRecord } from "./canvas-host";
import type { CanvasTask, SubmitCanvasTask } from "./contracts";

export type CanvasNodeTaskSubmitter = (input: SubmitCanvasTask, targetNodeId: string, title: string, signal: AbortSignal) => Promise<CanvasTask | undefined>;

export async function submitCanvasNodeTask({ taskExecution, onTaskRecordChange, updateNodes, input, targetNodeId, title, signal }: {
    taskExecution?: CanvasTaskExecution;
    onTaskRecordChange?: (record: CanvasHostTaskRecord) => void;
    updateNodes: (updater: (nodes: CanvasNodeData[]) => CanvasNodeData[]) => void;
    input: SubmitCanvasTask;
    targetNodeId: string;
    title: string;
    signal: AbortSignal;
}): Promise<CanvasTask | undefined> {
    if (!taskExecution) return undefined;
    signal.throwIfAborted();
    const task = await taskExecution.submit(input, { signal });
    if (signal.aborted) return undefined;
    onTaskRecordChange?.({ task, title, targetNodeId });
    updateNodes((nodes) => nodes.map((node) => node.id === targetNodeId ? { ...node, metadata: { ...node.metadata, taskId: task.taskId, status: "loading" } } : node));
    return task;
}
