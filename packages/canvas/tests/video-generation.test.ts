import { beforeEach, expect, test, vi } from "vitest";
import { createLocalCanvasVideoGeneration } from "../../../web/src/services/api/canvas/video-generation";
import type { CanvasMediaAdapter } from "../src/features/canvas/media";

const mocks = vi.hoisted(() => ({ create: vi.fn(), wait: vi.fn(), openProject: vi.fn(), resolveConfig: vi.fn(), resolveScript: vi.fn(), media: {} as CanvasMediaAdapter }));
vi.mock("@infinite-canvas/core/video-task", () => ({ createResolvedCanvasVideoTask: mocks.create }));
vi.mock("@infinite-canvas/core/provider/video-execution", () => ({ waitForResolvedVideoGenerationTask: mocks.wait }));
vi.mock("../../../web/src/services/api/canvas/provider-model", () => ({ resolveLocalCanvasProviderRequest: (config: unknown, model: string) => ({ requestConfig: mocks.resolveConfig(config, model), script: mocks.resolveScript(config, model) }) }));

const config = { model: "default::base", videoModel: "default::base", size: "1:1", videoSeconds: "6", vquality: "720", videoGenerateAudio: "true", videoWatermark: "false", videoMode: "frames", channels: [{ id: "default", apiKey: "host-only-key", baseUrl: "https://provider.invalid", apiFormat: "openai", compatProfile: "auto", models: [] }] } as never;
const request = { projectId: "project", prompt: "room", settings: { model: "default::video", size: "16:9", seconds: "8", quality: "1080", generateAudio: "false", watermark: "true", mode: "reference" }, references: [], videos: [], audios: [] };
const resolveVideoModel = () => ({ model: "video", capability: "video" as const, apiFormat: "openai" as const, compatProfile: "auto" as const, hasScript: false });
const resolvedConfig = { model: "video", videoModel: "video", baseUrl: "https://provider.invalid", apiKey: "host-only-key", apiFormat: "openai", compatProfile: "auto", size: "16:9", videoSeconds: "8", vquality: "1080", videoGenerateAudio: "false", videoWatermark: "true", videoMode: "reference" };

beforeEach(() => {
    vi.resetAllMocks();
    mocks.openProject.mockReturnValue({ id: "project" });
    mocks.resolveConfig.mockReturnValue(resolvedConfig);
    mocks.resolveScript.mockReturnValue("");
    mocks.create.mockResolvedValue({ id: "provider-task", provider: "grok", model: "default::video" });
    mocks.wait.mockResolvedValue({ blob: new Blob(["video"], { type: "video/mp4" }) });
});

test("web video host snapshots public settings and returns a recoverable provider handle", async () => {
    const signal = new AbortController().signal;
    const adapter = createLocalCanvasVideoGeneration(config, mocks.media, (projectId) => Boolean(mocks.openProject(projectId)), resolveVideoModel);
    await expect(adapter.create(request, signal)).resolves.toEqual({ id: "provider-task", provider: "grok", model: "default::video" });
    expect(mocks.resolveConfig).toHaveBeenCalledWith(config, "default::video");
    expect(mocks.resolveScript).toHaveBeenCalledWith(config, "default::video");
    expect(mocks.create).toHaveBeenCalledWith(mocks.media, "project", expect.objectContaining({ apiKey: "host-only-key", apiFormat: "openai", compatProfile: "auto", size: "16:9", videoSeconds: "8", vquality: "1080", videoGenerateAudio: "false", videoWatermark: "true", videoMode: "reference" }), "default::video", "", "room", [], { signal, videos: [], audios: [] });
    expect(JSON.stringify(request)).not.toContain("host-only-key");
    expect(mocks.openProject).toHaveBeenCalledTimes(2);
});

test("web host resolves model scripts before entering the shared provider executor", async () => {
    mocks.resolveScript.mockReturnValueOnce("host-resolved script");
    const adapter = createLocalCanvasVideoGeneration(config, mocks.media, (projectId) => Boolean(mocks.openProject(projectId)), resolveVideoModel);
    await adapter.create(request, new AbortController().signal);
    expect(mocks.create).toHaveBeenCalledWith(mocks.media, "project", expect.any(Object), "default::video", "host-resolved script", "room", [], expect.any(Object));
});

test("web video host checks project identity before and after restoring a provider task", async () => {
    const signal = new AbortController().signal;
    const adapter = createLocalCanvasVideoGeneration(config, mocks.media, (projectId) => Boolean(mocks.openProject(projectId)), resolveVideoModel);
    await expect(adapter.wait({ projectId: "project", settings: request.settings }, { id: "provider-task", provider: "grok", model: "default::video" }, signal)).resolves.toMatchObject({ blob: expect.any(Blob) });
    expect(mocks.resolveConfig).toHaveBeenCalledWith(config, "default::video");
    expect(mocks.wait).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "host-only-key", model: "video", videoSeconds: "8", videoMode: "reference" }), { id: "provider-task", provider: "grok", model: "default::video" }, { signal });
    expect(mocks.openProject).toHaveBeenCalledTimes(2);
});

test("missing project is rejected without calling the provider", async () => {
    mocks.openProject.mockReturnValue(undefined);
    const adapter = createLocalCanvasVideoGeneration(config, mocks.media, (projectId) => Boolean(mocks.openProject(projectId)), resolveVideoModel);
    await expect(adapter.create(request, new AbortController().signal)).rejects.toThrow("项目不存在");
    expect(mocks.create).not.toHaveBeenCalled();
});

test("cancellation is checked before provider work", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = createLocalCanvasVideoGeneration(config, mocks.media, (projectId) => Boolean(mocks.openProject(projectId)), resolveVideoModel);
    await expect(adapter.create(request, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.create).not.toHaveBeenCalled();
});

test("project removal during create or wait prevents returning a stale result", async () => {
    const adapter = createLocalCanvasVideoGeneration(config, mocks.media, (projectId) => projectId === "project" && Boolean(mocks.openProject(projectId)), resolveVideoModel);
    mocks.create.mockImplementationOnce(async () => { mocks.openProject.mockReturnValue(undefined); return { id: "provider-task", provider: "grok", model: "default::video" }; });
    await expect(adapter.create(request, new AbortController().signal)).rejects.toThrow("项目不存在");
    expect(mocks.wait).not.toHaveBeenCalled();

    mocks.openProject.mockReturnValue({ id: "project" });
    mocks.wait.mockImplementationOnce(async () => { mocks.openProject.mockReturnValue(undefined); return { blob: new Blob(["video"], { type: "video/mp4" }) }; });
    await expect(adapter.wait({ projectId: "project", settings: request.settings }, { id: "task", provider: "grok", model: "default::video" }, new AbortController().signal)).rejects.toThrow("项目不存在");
});

test("video host rejects an unknown or non-video model before provider execution", async () => {
    const adapter = createLocalCanvasVideoGeneration(config, mocks.media, (projectId) => Boolean(mocks.openProject(projectId)), () => null);

    await expect(adapter.create(request, new AbortController().signal)).rejects.toThrow("视频模型未配置或不支持视频能力");
    expect(mocks.create).not.toHaveBeenCalled();
});
