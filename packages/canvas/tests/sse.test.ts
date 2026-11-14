import { describe, expect, it } from "vitest";
import { splitSseFrames } from "@infinite-canvas/core/provider/sse";

describe("splitSseFrames", () => {
    it("retains partial frames between chunks and accepts CRLF separators", () => {
        const first = splitSseFrames("", "data: {\"delta\":\"a\"}\r");
        expect(first).toEqual({ buffer: "data: {\"delta\":\"a\"}\r", frames: [] });

        const second = splitSseFrames(first.buffer, "\n\r\ndata: [DONE]\r\n\r\n");
        expect(second).toEqual({ buffer: "", frames: ["data: {\"delta\":\"a\"}", "data: [DONE]"] });
    });

    it("flushes a final frame without a separator", () => {
        expect(splitSseFrames("data: final", "", true)).toEqual({ buffer: "", frames: ["data: final"] });
    });

    it("does not emit an empty trailing frame", () => {
        expect(splitSseFrames("", "data: one\n\n", true)).toEqual({ buffer: "", frames: ["data: one"] });
    });
});
