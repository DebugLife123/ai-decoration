import { describe, expect, test, vi } from "vitest";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { CanvasTask } from "../src/features/canvas/contracts";
import type { CanvasTaskExecution } from "../src/services/api/canvas/task-workflow";
import { submitCanvasNodeTask } from "../src/features/canvas/node-task-submission";

const nodes: CanvasNodeData[] = [
    { id: "target", type: CanvasNodeType.Image, title: "Result", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "pending" } },
    { id: "other", type: CanvasNodeType.Image, title: "Other", position: { x: 120, y: 0 }, width: 100, height: 100, metadata: {} },
];

const task: CanvasTask = {
    taskId: "task-1", projectId: "project-1", type: "EDIT", status: "QUEUED", sourceAssetId: "asset-1", sourceVersionId: null,
    resultAssetId: null, versionId: null, error: null, createdAt: "now", updatedAt: "now",
};

function setup(submitTask = vi.fn().mockResolvedValue(task)) {
    let currentNodes = nodes;
    const updateNodes = (updater: (items: CanvasNodeData[]) => CanvasNodeData[]) => { currentNodes = updater(currentNodes); };
    const taskExecution = { submit: submitTask } as unknown as CanvasTaskExecution;
    const onTaskRecordChange = vi.fn();
    return { get nodes() { return currentNodes; }, updateNodes, taskExecution, submitTask, onTaskRecordChange };
}

describe("canvas node task submission", () => {
    test("records the task and writes its identity to only the target node", async () => {
        const state = setup();
        const controller = new AbortController();

        await expect(submitCanvasNodeTask({
            taskExecution: state.taskExecution,
            onTaskRecordChange: state.onTaskRecordChange,
            updateNodes: state.updateNodes,
            input: { projectId: "project-1", type: "EDIT", prompt: "edit", sourceAssetId: "asset-1" },
            targetNodeId: "target",
            title: "Image edit",
            signal: controller.signal,
        })).resolves.toEqual(task);

        expect(state.onTaskRecordChange).toHaveBeenCalledWith({ task, title: "Image edit", targetNodeId: "target" });
        expect(state.nodes[0].metadata).toMatchObject({ content: "pending", taskId: task.taskId, status: "loading" });
        expect(state.nodes[1]).toEqual(nodes[1]);
    });

    test("does not write a task accepted after its caller was canceled", async () => {
        let acceptTask!: (value: CanvasTask) => void;
        const state = setup(vi.fn(() => new Promise<CanvasTask>((resolve) => { acceptTask = resolve; })));
        const controller = new AbortController();
        const pending = submitCanvasNodeTask({
            taskExecution: state.taskExecution,
            onTaskRecordChange: state.onTaskRecordChange,
            updateNodes: state.updateNodes,
            input: { projectId: "project-1", type: "EDIT", prompt: "edit", sourceAssetId: "asset-1" },
            targetNodeId: "target",
            title: "Image edit",
            signal: controller.signal,
        });

        controller.abort();
        acceptTask(task);

        await expect(pending).resolves.toBeUndefined();
        expect(state.onTaskRecordChange).not.toHaveBeenCalled();
        expect(state.nodes).toEqual(nodes);
    });
});
