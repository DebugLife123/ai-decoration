import { expect, test, vi } from "vitest";
import { isVideoTaskFailed, isVideoTaskTimeout } from "../src/services/api/video-errors";

test("video task error guards only match their named task errors", () => {
    const failed = new Error("provider failed");
    failed.name = "VideoTaskFailed";
    const timeout = new Error("deadline reached");
    timeout.name = "VideoTaskTimeout";

    expect(isVideoTaskFailed(failed)).toBe(true);
    expect(isVideoTaskTimeout(timeout)).toBe(true);
    expect(isVideoTaskFailed(new Error("other"))).toBe(false);
    expect(isVideoTaskTimeout("VideoTaskTimeout")).toBe(false);
});

test("legacy video API keeps the same error guard exports", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const legacy = await import("../src/services/api/video-api");
    expect(legacy.isVideoTaskFailed).toBe(isVideoTaskFailed);
    expect(legacy.isVideoTaskTimeout).toBe(isVideoTaskTimeout);
    vi.unstubAllGlobals();
});
