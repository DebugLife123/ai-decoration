import axios from "axios";
import { beforeEach, expect, test, vi } from "vitest";
import { fetchImageModels } from "../src/services/api/image-models";
import type { ProviderRequestConfig } from "../src/types/provider-request";

vi.mock("axios", () => ({ default: { get: vi.fn(), isCancel: vi.fn(() => false), isAxiosError: vi.fn(() => false) } }));
vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));

const get = vi.mocked(axios.get);
const config = (apiFormat: ProviderRequestConfig["apiFormat"]): Pick<ProviderRequestConfig, "baseUrl" | "apiKey" | "apiFormat" | "proxyEnabled" | "proxyUrl"> => ({
    baseUrl: apiFormat === "gemini" ? "https://generativelanguage.googleapis.com" : "https://api.example.com/v1",
    apiKey: "test-key",
    apiFormat,
    proxyEnabled: true,
    proxyUrl: "127.0.0.1:23210",
});

beforeEach(() => vi.resetAllMocks());

test("OpenAI model discovery sorts identifiers and uses the configured proxy", async () => {
    get.mockResolvedValue({ data: { data: [{ id: "z-model" }, {}, { id: "a-model" }] } });
    await expect(fetchImageModels(config("openai"))).resolves.toEqual(["a-model", "z-model"]);
    expect(get).toHaveBeenCalledWith("http://127.0.0.1:23210/https://api.example.com/v1/models", { headers: { Authorization: "Bearer test-key" } });
});

test("Gemini model discovery normalizes names and sends the API key header", async () => {
    get.mockResolvedValue({ data: { models: [{ name: "models/z-model" }, {}, { name: "models/a-model" }] } });
    await expect(fetchImageModels(config("gemini"))).resolves.toEqual(["a-model", "z-model"]);
    expect(get).toHaveBeenCalledWith("http://127.0.0.1:23210/https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": "test-key" } });
});

test("model discovery reports structured API errors", async () => {
    get.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: { error: { message: "fixture denied" } } }, message: "request failed" });
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    await expect(fetchImageModels(config("openai"))).rejects.toThrow("fixture denied");
});
