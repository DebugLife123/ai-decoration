import { describe, expect, test } from "vitest";
import { isAgentThreadLoadCurrent, loadAgentThreadSnapshot, reconcileAgentThreadSnapshot } from "../../../web/src/features/agent/thread-sync";

describe("Agent thread snapshot coordination", () => {
    test("rejects late responses from an old thread or request generation", () => {
        const request = { threadId: "thread-a", sequence: 4 };
        expect(isAgentThreadLoadCurrent(request, "thread-a", 4)).toBe(true);
        expect(isAgentThreadLoadCurrent(request, "thread-b", 4)).toBe(false);
        expect(isAgentThreadLoadCurrent(request, "thread-a", 5)).toBe(false);
        expect(isAgentThreadLoadCurrent({ threadId: "", sequence: 4 }, "", 4)).toBe(false);
    });

    test("reconciles authoritative turns, the active turn and live-only messages", () => {
        const snapshot = [{ id: "thread-a:turn-1:item-1", itemId: "item-1", threadId: "thread-a", turnId: "turn-1", role: "assistant" as const, text: "saved" }];
        const current = [
            { id: "thread-a:turn-2:item-2", itemId: "item-2", threadId: "thread-a", turnId: "turn-2", role: "assistant" as const, text: "active" },
            { id: "thread-a:turn-3:item-3", itemId: "item-3", threadId: "thread-a", turnId: "turn-3", role: "assistant" as const, text: "streaming" },
        ];
        const reconciled = reconcileAgentThreadSnapshot({
            threadId: "thread-a",
            settledTurnIds: ["turn-1"],
            activeTurnId: "turn-2",
            expectedTurnId: "turn-1",
            snapshot,
            current,
            liveTurnKeys: new Set(["thread-a\0turn-1", "thread-a\0turn-3"]),
        });

        expect(reconciled.expectedTurnSettled).toBe(true);
        expect(reconciled.authoritativeTurnKeys).toEqual(new Set(["thread-a\0turn-1"]));
        expect(reconciled.liveTurnKeys).toEqual(new Set(["thread-a\0turn-2", "thread-a\0turn-3"]));
        expect(reconciled.messages.map((item) => item.id)).toEqual([snapshot[0].id, current[0].id, current[1].id]);
    });

    test("waits for a requested turn unless the thread API has settled it", () => {
        const reconciled = reconcileAgentThreadSnapshot({
            threadId: "thread-a",
            settledTurnIds: [],
            activeTurnId: "turn-2",
            expectedTurnId: "turn-1",
            snapshot: [],
            current: [],
            liveTurnKeys: new Set(),
        });
        expect(reconciled.expectedTurnSettled).toBe(false);
    });

    test("keeps the retry and apply loop injectable without accepting a late snapshot", async () => {
        const scope = { threadId: "thread-a", sequence: 4 };
        let currentChecks = 0;
        let applied = false;
        const result = await loadAgentThreadSnapshot({
            scope,
            retryDelaysMs: [0],
            wait: async () => undefined,
            isCurrent: () => ++currentChecks === 1,
            fetchSnapshot: async () => ({ messages: ["late"] }),
            applySnapshot: () => { applied = true; return true; },
            expectedTurnId: "turn-1",
        });

        expect(result).toBe(false);
        expect(applied).toBe(false);
    });

    test("retries failed snapshot reads and returns when the expected history is ready", async () => {
        const delays: number[] = [];
        let reads = 0;
        const result = await loadAgentThreadSnapshot({
            scope: { threadId: "thread-a", sequence: 1 },
            retryDelaysMs: [0, 150, 350],
            wait: async (ms) => { delays.push(ms); },
            isCurrent: () => true,
            fetchSnapshot: async () => {
                reads += 1;
                if (reads === 1) throw new Error("temporary read failure");
                return { historyReady: true };
            },
            applySnapshot: (snapshot) => snapshot.historyReady,
            expectedTurnId: "turn-1",
        });

        expect(result).toBe(true);
        expect(reads).toBe(2);
        expect(delays).toEqual([150]);
    });
});
