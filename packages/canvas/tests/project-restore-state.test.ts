import { describe, expect, test } from "vitest";
import { createCanvasProjectRestoreState } from "../src/features/canvas/project-restore-state";

const project = {
    projectId: "project-1",
    nodes: [],
    connections: [],
    chatSessions: [],
    activeChatId: "",
    backgroundMode: "lines" as const,
    showImageInfo: false,
    viewport: { x: 0, y: 0, k: 1 },
    currentVersionId: null,
};

describe("Canvas project restore state", () => {
    test("normalizes empty optional values once for document, baseline, and history", () => {
        const restored = createCanvasProjectRestoreState(project);

        expect(restored.document.activeChatId).toBeNull();
        expect(restored.document.showImageInfo).toBe(false);
        expect(restored.baseline).toEqual({ nodes: project.nodes, connections: project.connections, backgroundMode: "lines", showImageInfo: false });
        expect(restored.history).toEqual({ ...restored.baseline, chatSessions: [], activeChatId: null });
    });

    test("keeps project arrays and display settings by reference/value", () => {
        const nodes = [{ id: "node-1" }] as never[];
        const connections = [{ id: "connection-1" }] as never[];
        const restored = createCanvasProjectRestoreState({ ...project, nodes, connections, activeChatId: "chat-1", showImageInfo: true });

        expect(restored.document.nodes).toBe(nodes);
        expect(restored.baseline.connections).toBe(connections);
        expect(restored.history.activeChatId).toBe("chat-1");
        expect(restored.history.showImageInfo).toBe(true);
    });
});
