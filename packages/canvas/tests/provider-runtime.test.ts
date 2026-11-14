import { expect, test } from "vitest";
import { buildProviderApiUrl, modelOptionName, withProviderProxy } from "../src/lib/provider-runtime";

test("provider URL helper preserves the current OpenAI base path behavior", () => {
    expect(buildProviderApiUrl(" https://api.example.com/ ", "/images/generations")).toBe("https://api.example.com/v1/images/generations");
    expect(buildProviderApiUrl("https://api.example.com/v1", "/models")).toBe("https://api.example.com/v1/models");
});

test("provider URL helper applies only the supplied local proxy settings", () => {
    const proxy = { proxyEnabled: true, proxyUrl: "127.0.0.1:23210/" };
    expect(buildProviderApiUrl("https://api.example.com", "/images/generations", proxy)).toBe("http://127.0.0.1:23210/https://api.example.com/v1/images/generations");
    expect(withProviderProxy("http://127.0.0.1:23210/https://api.example.com/path", proxy)).toBe("http://127.0.0.1:23210/https://api.example.com/path");
    expect(buildProviderApiUrl("https://api.example.com", "/images/generations", { ...proxy, proxyEnabled: false })).toBe("https://api.example.com/v1/images/generations");
});

test("provider model names omit a selected channel prefix", () => {
    expect(modelOptionName("channel-2::video-model")).toBe("video-model");
    expect(modelOptionName("video-model")).toBe("video-model");
});
