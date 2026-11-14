import { describe, expect, test } from "vitest";
import {
    authoritativeHistoryTurnKeys,
    bindPendingTurnMessages,
    isCurrentThreadEvent,
    mergeAgentMessages,
    registerLiveAgentTurn,
    scopeChatItem,
} from "../../../web/src/features/agent/message-scope";

describe("Agent message identity and history scope", () => {
    test("accepts only events for the active thread, including protocol aliases", () => {
        expect(isCurrentThreadEvent({ threadId: "thread-a" }, "thread-a")).toBe(true);
        expect(isCurrentThreadEvent({ thread_id: "thread-a" }, "thread-a")).toBe(true);
        expect(isCurrentThreadEvent({ threadId: "thread-b" }, "thread-a")).toBe(false);
        expect(isCurrentThreadEvent({}, "thread-a")).toBe(false);
    });

    test("deduplicates only replayed turns already covered by authoritative history", () => {
        const authoritative = authoritativeHistoryTurnKeys("thread-a", ["turn-1"]);
        const live = new Set<string>();

        expect(registerLiveAgentTurn({ threadId: "thread-a", turnId: "turn-1", replayed: true }, authoritative, live)).toBe(false);
        expect(registerLiveAgentTurn({ threadId: "thread-a", turnId: "turn-1" }, authoritative, live)).toBe(true);
        expect(registerLiveAgentTurn({ threadId: "thread-a", turnId: "turn-2", replayed: true }, authoritative, live)).toBe(true);
        expect(live.has("thread-a\0turn-2")).toBe(true);
    });

    test("builds stable thread, turn and item identity while grouping user input", () => {
        const assistant = scopeChatItem({ id: "raw", itemId: "item-1", role: "assistant", text: "done" }, "thread-a", "turn-1");
        const user = scopeChatItem({ id: "request-1", role: "user", text: "go" }, "thread-a", "");

        expect(assistant).toMatchObject({ id: "thread-a:turn-1:item-1", threadId: "thread-a", turnId: "turn-1", itemId: "item-1" });
        expect(user).toMatchObject({ id: "thread-a:pending:synthetic:user", threadId: "thread-a", turnId: "", itemId: "synthetic:user" });
    });

    test("binds only the latest pending user message for the matching thread", () => {
        const messages = [
            { id: "a", role: "user" as const, text: "old", threadId: "thread-a", turnId: "turn-1" },
            { id: "b", role: "user" as const, text: "pending a", threadId: "thread-a", turnId: "" },
            { id: "c", role: "user" as const, text: "pending b", threadId: "thread-a", turnId: "" },
            { id: "d", role: "user" as const, text: "other", threadId: "thread-b", turnId: "" },
        ];
        const next = bindPendingTurnMessages(messages, "thread-a", "turn-2");

        expect(next[1]).toBe(messages[1]);
        expect(next[2]).toMatchObject({ id: "thread-a:turn-2:synthetic:user", turnId: "turn-2" });
        expect(next[3]).toBe(messages[3]);
    });

    test("keeps authoritative history, local attachment metadata and only live unsettled messages", () => {
        const history = { id: "thread-a:turn-1:item-1", itemId: "item-1", threadId: "thread-a", turnId: "turn-1", role: "assistant" as const, text: "authoritative" };
        const current = [
            { ...history, text: "stale live text", attachments: [{ id: "asset-1", name: "room.png", url: "blob:preview" }] },
            { id: "thread-a:turn-2:item-2", itemId: "item-2", threadId: "thread-a", turnId: "turn-2", role: "assistant" as const, text: "live" },
            { id: "thread-a:turn-3:item-3", itemId: "item-3", threadId: "thread-a", turnId: "turn-3", role: "assistant" as const, text: "unsettled" },
            { id: "thread-b:turn-1:item-4", itemId: "item-4", threadId: "thread-b", turnId: "turn-1", role: "assistant" as const, text: "other" },
        ];
        const merged = mergeAgentMessages([history], current, "thread-a", new Set(["thread-a\0turn-2"]));

        expect(merged).toHaveLength(2);
        expect(merged[0]).toMatchObject({ text: "authoritative", attachments: current[0].attachments });
        expect(merged[1]).toMatchObject({ id: "thread-a:turn-2:item-2", text: "live" });
    });
});
