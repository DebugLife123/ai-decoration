import { afterEach, beforeEach, expect, test, vi } from "vitest";
import axios from "axios";
import { requestEdit } from "../src/services/api/image";
import { requestCanvasImageEdit } from "../src/services/api/canvas/edit-image";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";
import type { AiConfig } from "../src/stores/use-config-store";
import type { ReferenceImage } from "../src/types/image";
import { configureProviderMediaPersistence } from "../src/services/provider-media-persistence";

const mocks = vi.hoisted(() => ({ localRead: vi.fn(), plugin: vi.fn() }));
vi.mock("axios", () => ({ default: { post: vi.fn(), isAxiosError: () => false, isCancel: () => false } }));
vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../../../web/src/services/image-storage", () => ({ imageToDataUrl: mocks.localRead }));
vi.mock("../src/services/api/model-plugin", () => ({ runModelPlugin: mocks.plugin, normalizePluginImages: (result: string[]) => result }));
vi.mock("../src/lib/image-utils", () => ({ dataUrlToFile: (image: ReferenceImage) => new File([image.dataUrl], image.name, { type: image.type }) }));
vi.mock("../src/stores/use-config-store", () => ({
    resolveModelRequestConfig: (config: AiConfig) => config,
    resolveModelScript: (_config: AiConfig, model: string) => model === "scripted" ? "fixture script" : "",
    useConfigStore: { getState: () => ({ config: { proxyEnabled: false, proxyUrl: "" } }) },
    modelOptionName: (model: string) => model,
    buildApiUrl: (base: string, path: string) => `${base}${path}`,
    withLocalProxy: (url: string) => url,
}));

const providers = ["image-fixture", "gemini-fixture", "grok-imagine-edit", "scripted"];
const config = (model: string) => ({ model, apiFormat: model === "gemini-fixture" ? "gemini" : "openai", baseUrl: "https://fixture.invalid", apiKey: "fixture-not-a-secret", systemPrompt: "", size: "auto", quality: "auto", count: "1" }) as AiConfig;
const references: ReferenceImage[] = ["source", "mask"].map((id) => ({ id, name: `${id}.png`, type: "image/png", dataUrl: `blob:${id}`, storageKey: `image:${id}` }));
const bytes = (image: ReferenceImage) => `data:image/png;base64,${Buffer.from(image.id).toString("base64")}`;
const readImage = vi.fn<CanvasMediaAdapter["readImage"]>();
const media: CanvasMediaAdapter = { readImage, readMedia: vi.fn(), restore: async (_id, snapshot) => snapshot, cleanup() {} };
const post = vi.mocked(axios.post);

configureProviderMediaPersistence({
    readImage: async (image, signal) => mocks.localRead(image, { signal }),
    readMedia: async () => null,
    resolveMedia: async (_key, fallback) => fallback || null,
    uploadMedia: async (input) => ({ url: typeof input === "string" ? input : "blob:stored", storageKey: "image:stored", bytes: typeof input === "string" ? 0 : input.size, mimeType: typeof input === "string" ? "image/png" : input.type }),
});

beforeEach(() => {
    vi.resetAllMocks();
    readImage.mockImplementation(async (_id, image) => bytes(image));
    mocks.localRead.mockImplementation(() => { throw new Error("unexpected local read"); });
    mocks.plugin.mockResolvedValue(["data:image/png;base64,result"]);
    post.mockResolvedValue({ data: { data: [{ b64_json: "result" }], candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "result" } }] } }] } });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("unexpected network request"); }));
});
afterEach(() => vi.unstubAllGlobals());

test.each(providers)("%s canvas editing consumes host bytes once and preserves its payload and source metadata", async (model) => {
    const original = structuredClone(references);
    const signal = new AbortController().signal;
    expect(await requestCanvasImageEdit(media, "project", config(model), "room", references, signal)).toEqual([{ id: expect.any(String), dataUrl: "data:image/png;base64,result" }]);
    expect(readImage.mock.calls).toEqual(references.map((image) => ["project", image, signal]));
    const urls = references.map(bytes);
    if (model === "scripted") {
        expect(mocks.plugin.mock.calls[0][0]).toMatchObject({ images: urls, signal, params: { count: 1 } });
        expect(post).not.toHaveBeenCalled();
    } else {
        const body = post.mock.calls[0][1];
        if (model === "image-fixture") {
            const files = (body as FormData).getAll("image[]") as File[];
            expect(files.map((file) => [file.name, file.type])).toEqual(references.map((image) => [image.name, image.type]));
            expect(await Promise.all(files.map((file) => file.text()))).toEqual(urls);
            expect((body as FormData).get("model")).toBe(model);
        } else if (model === "gemini-fixture") {
            expect(body).toMatchObject({ contents: [{ role: "user", parts: [{ text: expect.any(String) }, ...references.map((image) => ({ inlineData: { mimeType: "image/png", data: Buffer.from(image.id).toString("base64") } }))] }] });
        } else {
            expect(body).toMatchObject({ model, images: urls.map((url) => ({ url })), n: 1 });
        }
        expect(post).toHaveBeenCalledOnce();
        expect(post.mock.calls[0][2]).toMatchObject({ signal });
    }
    expect(references).toEqual(original);
    expect(mocks.localRead).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});

test.each(providers)("%s injected reader failure never falls back to storage or submits a request", async (model) => {
    const reader = vi.fn().mockRejectedValue(new Error("host failed"));
    await expect(requestEdit(config(model), "room", references, { readImage: reader })).rejects.toThrow("host failed");
    expect(mocks.localRead).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(mocks.plugin).not.toHaveBeenCalled();
});

test.each(providers)("%s late reader success after cancellation cannot submit", async (model) => {
    const controller = new AbortController();
    const reader = vi.fn(async (image: ReferenceImage) => { controller.abort(); return bytes(image); });
    await expect(requestEdit(config(model), "room", [references[0]], { signal: controller.signal, readImage: reader })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
    expect(mocks.plugin).not.toHaveBeenCalled();
    expect(mocks.localRead).not.toHaveBeenCalled();
});

test.each(providers)("%s already cancelled inputs never enter a reader or submit", async (model) => {
    const controller = new AbortController();
    controller.abort();
    const reader = vi.fn();
    await expect(requestEdit(config(model), "room", references, { signal: controller.signal, readImage: reader })).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(mocks.plugin).not.toHaveBeenCalled();
});

test.each(providers)("%s non-canvas editing retains the legacy image reader with the request signal", async (model) => {
    mocks.localRead.mockImplementation(async (image: ReferenceImage) => bytes(image));
    const signal = new AbortController().signal;
    await requestEdit(config(model), "room", references, { signal });
    expect(mocks.localRead.mock.calls).toEqual(references.map((image) => [image, { signal }]));
    expect(readImage).not.toHaveBeenCalled();
});
