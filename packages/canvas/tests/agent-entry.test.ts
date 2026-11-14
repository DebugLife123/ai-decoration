import { describe, expect, test } from "vitest";
import { claimCanvasAgentAutoOpen } from "../src/features/canvas/agent-entry";

describe("Canvas Agent entry", () => {
    test.each(["new", "recent", "choose"])("allows automatic opening for %s", (mode) => {
        expect(claimCanvasAgentAutoOpen({ projectId: "project-1", mode, hasCustomBootstrap: false, enabled: false }, new Set())).toBe(true);
    });

    test("claims each project and entry mode only once", () => {
        const openedEntries = new Set<string>();
        const entry = { projectId: "project-1", mode: "choose", hasCustomBootstrap: false, enabled: false };

        expect(claimCanvasAgentAutoOpen(entry, openedEntries)).toBe(true);
        expect(claimCanvasAgentAutoOpen(entry, openedEntries)).toBe(false);
        expect(claimCanvasAgentAutoOpen({ ...entry, projectId: "project-2" }, openedEntries)).toBe(true);
        expect(claimCanvasAgentAutoOpen({ ...entry, mode: "recent" }, openedEntries)).toBe(true);
    });

    test.each([
        { projectId: "project-1", mode: "other", hasCustomBootstrap: false, enabled: false },
        { projectId: "project-1", mode: "choose", hasCustomBootstrap: true, enabled: false },
        { projectId: "project-1", mode: "choose", hasCustomBootstrap: false, enabled: true },
        { projectId: "", mode: "choose", hasCustomBootstrap: false, enabled: false },
    ])("does not auto-open when the host has already selected a connection mode or no valid entry exists", (entry) => {
        expect(claimCanvasAgentAutoOpen(entry, new Set())).toBe(false);
    });
});
