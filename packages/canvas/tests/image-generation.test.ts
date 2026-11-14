import { beforeEach, expect, test, vi } from "vitest";
import { generateCanvasImage, type CanvasImageGeneration, type CanvasImageRequest } from "../src/features/canvas/image-generation";
import type { AiConfig } from "../src/stores/use-config-store";
import { createLocalCanvasImageGeneration, createLocalCanvasPluginImageGeneration } from "../../../web/src/services/api/canvas/image-generation";
import { createLocalCanvasAudioGeneration } from "../../../web/src/services/api/canvas/audio-generation";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), edit: vi.fn(), audio: vi.fn(), resolveConfig: vi.fn(), resolveScript: vi.fn(), exists: true }));
vi.mock("@infinite-canvas/core/provider/image-execution", () => ({ requestResolvedGeneration: mocks.generate, requestResolvedEdit: mocks.edit }));
vi.mock("@infinite-canvas/core/provider/audio-execution", () => ({ requestResolvedAudioGeneration: mocks.audio }));
vi.mock("../../../web/src/services/api/canvas/provider-model", () => ({ resolveLocalCanvasProviderRequest: (config: AiConfig, model: string) => ({ requestConfig: mocks.resolveConfig(config, model), script: mocks.resolveScript(config, model) }) }));
const isProjectOpen = (projectId: string) => projectId === "project" && mocks.exists;

const settings = { model: "fixture::image", quality: "auto", size: "auto", background: "transparent" };
const request = (operation: CanvasImageRequest["operation"] = "generate"): CanvasImageRequest => ({
    projectId: "project", operation, prompt: "room", settings: { ...settings },
    references: operation === "edit" ? ["room", "reference"].map((id) => ({ id, name: `${id}.png`, type: "image/png", dataUrl: `data:image/png;base64,${id}` })) : [],
});
const config = { ...settings, apiKey: "fixture-not-a-secret", baseUrl: "https://fixture.invalid", channelMode: "local", channels: [], systemPrompt: "host system prompt", count: "3" } as unknown as AiConfig;
const resolveModel = (value: string) => ({ model: value.split("::").at(-1) || value, capability: /tts|audio/i.test(value) ? "audio" as const : "image" as const, apiFormat: "openai" as const, compatProfile: "auto" as const, hasScript: false });
const result = { dataUrl: "data:image/png;base64,result" };
const execute = vi.fn<CanvasImageGeneration["execute"]>();
const adapter: CanvasImageGeneration = { execute };
const run = (input = request(), signal = new AbortController().signal) => generateCanvasImage(adapter, input, signal);

beforeEach(() => {
    vi.resetAllMocks();
    mocks.exists = true;
    execute.mockResolvedValue(result);
    mocks.generate.mockResolvedValue([{ id: "provider-id", ...result }]);
    mocks.edit.mockResolvedValue([{ id: "provider-id", ...result }]);
    mocks.audio.mockResolvedValue(new Blob(["fixture"], { type: "audio/mpeg" }));
    mocks.resolveConfig.mockImplementation((input, model) => ({ ...input, model: model.split("::").at(-1), apiFormat: "openai", compatProfile: "auto" }));
    mocks.resolveScript.mockReturnValue("");
});

test("public dispatch only forwards non-secret settings and materialized reference bytes", async () => {
    const input = request("edit");
    input.settings = config;
    const references = input.references.map((image) => ({ ...image, storageKey: "image:local", url: "blob:local" }));
    input.references = references;
    const original = structuredClone(input);
    const signal = new AbortController().signal;
    await expect(run(input, signal)).resolves.toEqual(result);
    expect(execute).toHaveBeenCalledExactlyOnceWith({ ...request("edit"), settings }, signal);
    expect(input).toEqual(original);
    expect(execute.mock.calls[0][0].references).not.toBe(references);
});

test.each(["generate", "edit"] as const)("operation %s remains explicit, including empty references on retry", async (operation) => {
    await run({ ...request(operation), references: [] });
    expect(execute.mock.calls[0][0]).toMatchObject({ operation, references: [] });
});

test("missing Mock/host capability rejects without using a legacy Provider", async () => {
    await expect(generateCanvasImage(undefined, request(), new AbortController().signal)).rejects.toThrow("当前项目尚未配置图片生成服务");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
});

test("already cancelled calls never enter the host", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run(request(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(execute).not.toHaveBeenCalled();
});

test("late host success after cancellation cannot be published", async () => {
    const controller = new AbortController();
    execute.mockImplementation(async () => { controller.abort(); return result; });
    await expect(run(request(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});

test("host failure propagates once and manual retry is a new invocation", async () => {
    const failure = new Error("host failed");
    execute.mockRejectedValueOnce(failure);
    await expect(run()).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledOnce();
    await expect(run()).resolves.toEqual(result);
    expect(execute).toHaveBeenCalledTimes(2);
});

test("empty host result is an explicit failure", async () => {
    execute.mockResolvedValue({ dataUrl: "" });
    await expect(run()).rejects.toThrow("图片生成未返回");
});

test.each(["generate", "edit"] as const)("web %s retains host config snapshot, uses one result and strips Provider identity", async (operation) => {
    const host = createLocalCanvasImageGeneration(config, isProjectOpen, resolveModel);
    const input = request(operation);
    const signal = new AbortController().signal;
    const original = structuredClone(config);
    await expect(generateCanvasImage(host, input, signal)).resolves.toEqual(result);
    const provider = operation === "edit" ? mocks.edit : mocks.generate;
    const other = operation === "edit" ? mocks.generate : mocks.edit;
    expect(provider).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
    expect(provider.mock.calls[0][0]).toEqual(expect.objectContaining({ ...config, ...settings, imageModel: settings.model, count: "1", model: "image", apiFormat: "openai", compatProfile: "auto" }));
    expect(provider.mock.calls[0][1]).toBe("");
    expect(provider.mock.calls[0][2]).toBe("room");
    const options = provider.mock.calls[0][operation === "edit" ? 4 : 3];
    expect(options.signal).toBe(signal);
    if (operation === "edit") {
        expect(provider.mock.calls[0][3]).toEqual(input.references);
        expect(await options.readImage(input.references[0])).toBe(input.references[0].dataUrl);
    }
    expect(config).toEqual(original);
});

test("web applies saved retry settings without replacing host system prompt or channel config", async () => {
    const input = request("edit");
    input.settings = { model: "saved::image", quality: "high", size: "1024x1024", background: "opaque" };
    await generateCanvasImage(createLocalCanvasImageGeneration(config, isProjectOpen, resolveModel), input, new AbortController().signal);
    expect(mocks.edit.mock.calls[0][0]).toEqual(expect.objectContaining({ ...config, ...input.settings, imageModel: input.settings.model, count: "1", model: "image", apiFormat: "openai", compatProfile: "auto" }));
});

test.each(["generate", "edit"] as const)("web plugin %s preserves requested result count", async (operation) => {
    mocks.generate.mockResolvedValue([{ id: "one", dataUrl: "one" }, { id: "two", dataUrl: "two" }]);
    mocks.edit.mockResolvedValue([{ id: "one", dataUrl: "one" }, { id: "two", dataUrl: "two" }]);
    const input = request(operation);
    input.settings = { ...settings, count: 2 };
    await expect(createLocalCanvasPluginImageGeneration(config, isProjectOpen, resolveModel).execute(input, new AbortController().signal)).resolves.toEqual({ dataUrls: ["one", "two"] });
    const provider = operation === "edit" ? mocks.edit : mocks.generate;
    const other = operation === "edit" ? mocks.generate : mocks.edit;
    expect(provider).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
    expect(provider.mock.calls[0][0]).toEqual(expect.objectContaining({ ...config, ...settings, imageModel: settings.model, count: "2", model: "image", apiFormat: "openai", compatProfile: "auto" }));
    expect(provider.mock.calls[0][1]).toBe("");
    expect(provider.mock.calls[0][2]).toBe("room");
    if (operation === "edit") expect(provider.mock.calls[0][3]).toEqual(input.references);
});

test("web audio adapter forwards only selected audio settings and checks cancellation/project", async () => {
    const host = createLocalCanvasAudioGeneration(config, isProjectOpen, resolveModel);
    const signal = new AbortController().signal;
    const settings = { model: "fixture::tts", voice: "alloy", format: "mp3", speed: "1.25", instructions: "fixture instruction" };
    const output = new Blob(["fixture"], { type: "audio/mpeg" });
    mocks.audio.mockResolvedValue(output);
    await expect(host.execute({ projectId: "project", prompt: "hello", settings }, signal)).resolves.toBe(output);
    expect(mocks.resolveConfig).toHaveBeenCalledWith(expect.objectContaining({ model: settings.model, audioModel: settings.model, audioVoice: settings.voice, audioFormat: settings.format, audioSpeed: settings.speed, audioInstructions: settings.instructions }), settings.model);
    expect(mocks.audio).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ model: "tts", audioVoice: settings.voice, audioFormat: settings.format, audioSpeed: settings.speed, audioInstructions: settings.instructions, apiKey: config.apiKey, apiFormat: "openai", compatProfile: "auto" }), "", "hello", { signal });
    const controller = new AbortController();
    controller.abort();
    await expect(host.execute({ projectId: "project", prompt: "hello", settings }, controller.signal)).rejects.toThrow();
    mocks.exists = false;
    await expect(host.execute({ projectId: "project", prompt: "hello", settings }, signal)).rejects.toThrow("项目不存在");
    expect(mocks.audio).toHaveBeenCalledOnce();
});

test("web audio host resolves the channel and custom script before shared Provider execution", async () => {
    mocks.resolveScript.mockReturnValueOnce("host-resolved audio script");
    const host = createLocalCanvasAudioGeneration(config, isProjectOpen, resolveModel);
    const settings = { model: "studio::fixture-tts", voice: "alloy", format: "wav", speed: "1", instructions: "" };
    await host.execute({ projectId: "project", prompt: "hello", settings }, new AbortController().signal);
    expect(mocks.resolveConfig).toHaveBeenCalledWith(expect.objectContaining({ model: settings.model, audioModel: settings.model }), settings.model);
    expect(mocks.resolveScript).toHaveBeenCalledWith(expect.objectContaining({ model: settings.model }), settings.model);
    expect(mocks.audio).toHaveBeenCalledWith(expect.objectContaining({ model: "fixture-tts", audioFormat: "wav", apiKey: config.apiKey, compatProfile: "auto" }), "host-resolved audio script", "hello", expect.any(Object));
});

test("image, plugin image, and audio adapters reject a mismatched model before provider calls", async () => {
    const imageHost = createLocalCanvasImageGeneration(config, isProjectOpen, () => ({ ...resolveModel("image"), capability: "audio" }));
    const pluginHost = createLocalCanvasPluginImageGeneration(config, isProjectOpen, () => ({ ...resolveModel("audio"), capability: "audio" }));
    const audioHost = createLocalCanvasAudioGeneration(config, isProjectOpen, () => ({ ...resolveModel("image"), capability: "image" }));
    const signal = new AbortController().signal;

    await expect(imageHost.execute(request(), signal)).rejects.toThrow("图像模型未配置或不支持图像能力");
    await expect(pluginHost.execute(request(), signal)).rejects.toThrow("图像模型未配置或不支持图像能力");
    await expect(audioHost.execute({ projectId: "project", prompt: "hello", settings: { model: "fixture::tts", voice: "alloy", format: "mp3", speed: "1", instructions: "" } }, signal)).rejects.toThrow("音频模型未配置或不支持音频能力");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.audio).not.toHaveBeenCalled();
});

test("audio adapter discards provider output when its project disappears", async () => {
    const host = createLocalCanvasAudioGeneration(config, isProjectOpen, resolveModel);
    mocks.audio.mockImplementationOnce(async () => { mocks.exists = false; return new Blob(["late"], { type: "audio/mpeg" }); });
    await expect(host.execute({ projectId: "project", prompt: "hello", settings: { model: "tts", voice: "alloy", format: "mp3", speed: "1", instructions: "" } }, new AbortController().signal)).rejects.toThrow("项目不存在");
    expect(mocks.audio).toHaveBeenCalledOnce();
});

test.each(["missing", "cancelled"])("web %s project/request never submits", async (state) => {
    const controller = new AbortController();
    if (state === "missing") mocks.exists = false;
    else controller.abort();
    await expect(createLocalCanvasImageGeneration(config, isProjectOpen, resolveModel).execute(request(), controller.signal)).rejects.toThrow();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
});

test.each(["removed", "cancelled"])("web %s during Provider call rejects late result", async (state) => {
    const controller = new AbortController();
    mocks.generate.mockImplementation(async () => {
        if (state === "removed") mocks.exists = false;
        else controller.abort();
        return [{ id: "provider-id", ...result }];
    });
    await expect(createLocalCanvasImageGeneration(config, isProjectOpen, resolveModel).execute(request(), controller.signal)).rejects.toThrow();
    expect(mocks.generate).toHaveBeenCalledOnce();
});

test("web Provider error is not retried or replaced with a Mock result", async () => {
    const failure = new Error("provider failed");
    mocks.edit.mockRejectedValue(failure);
    await expect(generateCanvasImage(createLocalCanvasImageGeneration(config, isProjectOpen, resolveModel), request("edit"), new AbortController().signal)).rejects.toBe(failure);
    expect(mocks.edit).toHaveBeenCalledOnce();
    expect(mocks.generate).not.toHaveBeenCalled();
});

test.each([{ output: [] }, { output: [{ id: "provider-id", dataUrl: "" }] }])("web rejects empty Provider output: %j", async ({ output }) => {
    mocks.generate.mockResolvedValue(output);
    await expect(generateCanvasImage(createLocalCanvasImageGeneration(config, isProjectOpen, resolveModel), request(), new AbortController().signal)).rejects.toThrow("图片生成未返回");
});
