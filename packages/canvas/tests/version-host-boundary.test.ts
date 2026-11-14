import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { createApiCanvasVersionHost, createCanvasVersionHost } from "@infinite-canvas/core/canvas/version-host";
import { createApiCanvasVersionHost as createCompatibleApiCanvasVersionHost } from "../src/features/canvas/project-host";

const sourceRoot = resolve(import.meta.dirname, "../src/features/canvas");

describe("Canvas version host boundary", () => {
    test("exports version hosts from their dedicated feature module", () => {
        expect(createApiCanvasVersionHost).toBeTypeOf("function");
        expect(createCanvasVersionHost).toBeTypeOf("function");
        expect(createCompatibleApiCanvasVersionHost).toBe(createApiCanvasVersionHost);
    });

    test("project host keeps project lifecycle only", () => {
        const source = readFileSync(resolve(sourceRoot, "project-host.ts"), "utf8");
        expect(source).toContain('from "./version-host"');
        expect(source).not.toContain("function createApiCanvasVersionHost");
        expect(source).not.toContain("function createCanvasVersionHost");
    });

    test("declares a public package subpath for the version host", () => {
        const manifest = JSON.parse(readFileSync(resolve(sourceRoot, "../../../package.json"), "utf8"));
        expect(manifest.exports["./canvas/version-host"]).toBe("./src/features/canvas/version-host.ts");
    });
});
