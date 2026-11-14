import { describe, expect, test } from "vitest";
import { hasCanvasHistoryChanged } from "../src/features/canvas/history-change";

const base = {
    nodes: [],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    backgroundMode: "lines" as const,
    showImageInfo: false,
};

describe("Canvas history change detection", () => {
    test("treats the initial entry as a change and identical references as unchanged", () => {
        expect(hasCanvasHistoryChanged(null, base)).toBe(true);
        expect(hasCanvasHistoryChanged(base, base)).toBe(false);
    });

    test.each([
        { nodes: [...base.nodes] },
        { connections: [...base.connections] },
        { chatSessions: [...base.chatSessions] },
        { activeChatId: "chat-1" },
        { backgroundMode: "dots" as const },
        { showImageInfo: true },
    ])("detects a change to a tracked history field", (change) => {
        expect(hasCanvasHistoryChanged(base, { ...base, ...change })).toBe(true);
    });
});
