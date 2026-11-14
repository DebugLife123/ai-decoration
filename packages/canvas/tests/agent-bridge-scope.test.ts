import { describe, expect, test } from "vitest";
import { isCanvasAgentScopeCurrent } from "../src/features/canvas/agent-bridge-scope";

describe("Canvas Agent bridge scope", () => {
    test("allows operations only for the enabled active scope", () => {
        expect(isCanvasAgentScopeCurrent({ enabled: true, scopeKey: "project-a:1" }, "project-a:1")).toBe(true);
        expect(isCanvasAgentScopeCurrent({ enabled: false, scopeKey: "project-a:1" }, "project-a:1")).toBe(false);
        expect(isCanvasAgentScopeCurrent({ enabled: true, scopeKey: "project-b:1" }, "project-a:1")).toBe(false);
        expect(isCanvasAgentScopeCurrent({ enabled: true, scopeKey: "project-a:2" }, "project-a:1")).toBe(false);
    });
});
