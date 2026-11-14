import { afterEach, beforeEach, expect, test, vi } from "vitest";
import axios from "axios";
import { createCanvasVideoTask } from "../src/services/api/canvas/create-video-task";
import { createResolvedVideoGenerationTask } from "../src/services/api/video";
import { createVideoGenerationTask } from "../src/services/api/video-workbench";
import { createGrokVideoTask } from "../src/services/api/grok-video";
import { createSpecializedVideoTask } from "../src/services/api/specialized-video";
import { createMockCanvasAdapter } from "../src/services/api/canvas/mock-adapter";
import type { CanvasMediaAdapter, CanvasMediaReference } from "../src/features/canvas/media";
import type { AiConfig } from "../src/stores/use-config-store";
import type { ProviderRequestConfig } from "../src/types/provider-request";
import type { ReferenceImage } from "../src/types/image";
import { dataUrlToFile } from "../src/lib/image-utils";
import { configureProviderMediaPersistence } from "../src/services/provider-media-persistence";

const mocks = vi.hoisted(() => ({ readStored: vi.fn(), resolveUrl: vi.fn(), plugin: vi.fn() }));
vi.mock("axios", () => ({ default: { post: vi.fn(), isAxiosError: () => false, isCancel: () => false } }));
vi.mock("../src/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../../../web/src/services/file-storage", () => ({ getMediaBlob: mocks.readStored, resolveMediaUrl: mocks.resolveUrl }));
vi.mock("../../../web/src/services/image-storage", () => ({ imageToDataUrl: () => { throw new Error("unexpected image read"); } }));
vi.mock("../src/services/api/model-plugin", () => ({ runModelPlugin: mocks.plugin }));
vi.mock("../src/lib/image-utils", () => ({
    readFileAsDataUrl: async (file: File) => `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`,
    dataUrlToFile: vi.fn(),
}));
vi.mock("../src/stores/use-config-store", () => ({
    resolveModelRequestConfig: (config: AiConfig) => config,
    resolveModelScript: (_config: AiConfig, model: string) => model === "scripted" ? "fixture script" : "",
    modelOptionName: (model: string) => model,
    buildApiUrl: (base: string, path: string) => `${base}${path}`,
    withLocalProxy: (url: string) => url,
    boolConfig: (value: string, fallback: boolean) => value ? value === "true" : fallback,
}));

const config = (model = "video-fixture", apiFormat = "openai") => ({ model, videoModel: model, apiFormat, baseUrl: "https://fixture.invalid", apiKey: "fixture-not-a-secret", size: "16:9", videoSeconds: "8", vquality: "720", videoMode: "reference", videoGenerateAudio: "true", videoWatermark: "false" }) as AiConfig;
const video = (id = "one"): CanvasMediaReference => ({ name: `${id}.mp4`, type: "video/mp4", url: `blob:${id}`, storageKey: `video:${id}` });
const audio: CanvasMediaReference = { name: "voice.mp3", type: "audio/mpeg", url: "blob:voice", storageKey: "audio:voice" };
const bytes = (ref: CanvasMediaReference) => new Blob([ref.name], { type: ref.type });
const readMedia = vi.fn<CanvasMediaAdapter["readMedia"]>();
const media: CanvasMediaAdapter = { readMedia, readImage: vi.fn(), restore: async (_id, snapshot) => snapshot, cleanup() {} };
const post = vi.mocked(axios.post);

configureProviderMediaPersistence({
    readImage: async (image) => `data:image/png;base64,${Buffer.from(image.name).toString("base64")}`,
    readMedia: async (reference) => mocks.readStored(reference.storageKey || ""),
    resolveMedia: async (key, fallback) => key ? mocks.resolveUrl(key, fallback) : fallback || null,
    uploadMedia: async (input) => ({ url: typeof input === "string" ? input : "blob:stored", storageKey: "video:stored", bytes: typeof input === "string" ? 0 : input.size, mimeType: typeof input === "string" ? "video/mp4" : input.type }),
});
const run = (model = "video-fixture", videos = [video()], audios: CanvasMediaReference[] = [audio], signal = new AbortController().signal, apiFormat = "openai", host = media) => createCanvasVideoTask(host, "project", config(model, apiFormat), "room", [], { videos, audios, signal });

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(dataUrlToFile).mockImplementation((image) => new File([image.dataUrl], image.name, { type: image.type }));
    readMedia.mockImplementation(async (_id, ref) => bytes(ref));
    post.mockResolvedValue({ data: { id: "provider-task", name: "operations/fixture" } });
    mocks.plugin.mockResolvedValue(new Blob(["result"], { type: "video/mp4" }));
    mocks.readStored.mockImplementation(() => { throw new Error("unexpected legacy storage read"); });
    mocks.resolveUrl.mockImplementation(() => { throw new Error("unexpected legacy URL resolution"); });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("unexpected network request"); }));
});
afterEach(() => vi.unstubAllGlobals());

test("OpenAI reads project media through the host and preserves reference order, names, MIME and source", async () => {
    const videos = [video("one"), video("two")];
    const original = structuredClone(videos);
    const signal = new AbortController().signal;
    readMedia.mockImplementation(async (id, ref, actualSignal) => {
        expect(id).toBe("project");
        expect(actualSignal).toBe(signal);
        const blob = bytes(ref);
        ref.name = "host mutation";
        return blob;
    });
    expect(await run("video-fixture", videos, [audio], signal)).toMatchObject({ id: "provider-task", provider: "openai" });
    const body = post.mock.calls[0][1] as FormData;
    const files = body.getAll("video[]") as File[];
    expect(files.map((file) => [file.name, file.type])).toEqual([["one.mp4", "video/mp4"], ["two.mp4", "video/mp4"]]);
    expect(await Promise.all(files.map((file) => file.text()))).toEqual(["one.mp4", "two.mp4"]);
    expect((body.get("audio[]") as File).name).toBe("voice.mp3");
    expect(body.get("model")).toBe("video-fixture");
    expect(body.get("prompt")).toBe("room");
    expect(post.mock.calls[0][2]).toMatchObject({ signal });
    expect(videos).toEqual(original);
    expect(mocks.readStored).not.toHaveBeenCalled();
    expect(mocks.resolveUrl).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});

test("resolved video execution applies proxy settings from its request config", async () => {
    const requestConfig = { ...config(), proxyEnabled: true, proxyUrl: "127.0.0.1:23210" } as unknown as ProviderRequestConfig;
    await createResolvedVideoGenerationTask(requestConfig, "video-fixture", "", "room", [], {
        signal: new AbortController().signal,
        readImage: async (image) => image.dataUrl,
        readMedia: async () => new Blob(),
    });
    expect(post.mock.calls[0][0]).toBe("http://127.0.0.1:23210/https://fixture.invalid/v1/videos");
});

test("all media reads must finish before request submission even when completion is out of order", async () => {
    let complete!: (blob: Blob) => void;
    readMedia.mockImplementation(async (_id, ref) => ref.name === "one.mp4" ? new Promise((resolve) => { complete = resolve; }) : bytes(ref));
    const pending = run("video-fixture", [video("one"), video("two")]);
    await vi.waitFor(() => expect(readMedia).toHaveBeenCalledTimes(2));
    expect(post).not.toHaveBeenCalled();
    complete(bytes(video("one")));
    await pending;
    expect((post.mock.calls[0][1] as FormData).getAll("video[]").map((file) => (file as File).name)).toEqual(["one.mp4", "two.mp4"]);
});

test("Gemini keeps first video/audio inline encoding while resolving every supplied input through the host", async () => {
    await run("veo-fixture", [video("one"), video("two")], [audio], new AbortController().signal, "gemini");
    expect(readMedia).toHaveBeenCalledTimes(3);
    expect(post.mock.calls[0][1]).toMatchObject({ instances: [{ prompt: "room", video: { bytesBase64Encoded: Buffer.from("one.mp4").toString("base64"), mimeType: "video/mp4" }, audio: { bytesBase64Encoded: Buffer.from("voice.mp3").toString("base64"), mimeType: "audio/mpeg" } }] });
    expect(mocks.readStored).not.toHaveBeenCalled();
});

test("scripted video models receive existing File arrays and parameters, not storage references", async () => {
    expect(await run("scripted")).toMatchObject({ provider: "plugin", model: "scripted" });
    expect(post).not.toHaveBeenCalled();
    const input = mocks.plugin.mock.calls[0][0];
    expect(input).toMatchObject({ capability: "video", prompt: "room", params: { seconds: "8", mode: "reference", generateAudio: true, watermark: false } });
    expect(input.videos[0]).toBeInstanceOf(File);
    expect(input.audios[0]).toBeInstanceOf(File);
    expect(await input.videos[0].text()).toBe("one.mp4");
    expect(await input.audios[0].text()).toBe("voice.mp3");
});

test("Grok video editing keeps its existing data URL payload without local storage reads", async () => {
    expect(await run("grok-video-fixture", [video()], [])).toMatchObject({ provider: "grok" });
    expect(readMedia).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][0]).toBe("https://fixture.invalid/v1/videos/edits");
    expect(post.mock.calls[0][1]).toMatchObject({ video: { url: `data:video/mp4;base64,${Buffer.from("one.mp4").toString("base64")}` } });
    expect(mocks.readStored).not.toHaveBeenCalled();
});

test("Grok and specialized leaf providers require an explicit media reader", async () => {
    const reference = video();
    const requestConfig = { ...config("grok-video-fixture"), compatProfile: {}, proxyEnabled: false, proxyUrl: "" } as unknown as ProviderRequestConfig;
    await expect(createGrokVideoTask(requestConfig, "grok-video-fixture", "room", [], { videos: [reference] })).rejects.toThrow("宿主媒体读取器");
    await expect(createSpecializedVideoTask(requestConfig, "seedance-fixture", "room", [], { videos: [reference] })).rejects.toThrow("宿主媒体读取器");
    expect(mocks.readStored).not.toHaveBeenCalled();
});

test("Grok and specialized image references require an explicit host image reader", async () => {
    const requestConfig = { ...config("seedance-fixture"), compatProfile: {}, proxyEnabled: false, proxyUrl: "" } as unknown as ProviderRequestConfig;
    await expect(createGrokVideoTask(requestConfig, "grok-video-fixture", "room", [{ name: "room.png", dataUrl: "data:image/png;base64,AA==" }]))
        .rejects.toThrow("宿主图片读取器");
    await expect(createSpecializedVideoTask(requestConfig, "seedance-fixture", "room", [{ name: "room.png", dataUrl: "data:image/png;base64,AA==" }]))
        .rejects.toThrow("宿主图片读取器");
    expect(mocks.readStored).not.toHaveBeenCalled();
});

test("specialized text-to-video does not require a media reader", async () => {
    const requestConfig = { ...config("seedance-fixture"), compatProfile: {}, proxyEnabled: false, proxyUrl: "" } as unknown as ProviderRequestConfig;
    await expect(createSpecializedVideoTask(requestConfig, "seedance-fixture", "room", [])).resolves.toMatchObject({ provider: "seedance" });
    expect(post).toHaveBeenCalledOnce();
    expect(mocks.readStored).not.toHaveBeenCalled();
});

test("Seedance retains ordered video/audio data URL fields and roles", async () => {
    expect(await run("seedance-fixture", [video("one"), video("two")])).toMatchObject({ provider: "seedance" });
    const url = (name: string, mime: string) => `data:${mime};base64,${Buffer.from(name).toString("base64")}`;
    expect(post.mock.calls[0][1]).toMatchObject({
        video_urls: [url("one.mp4", "video/mp4"), url("two.mp4", "video/mp4")],
        audio_urls: [url("voice.mp3", "audio/mpeg")],
        content: [{ type: "text", text: "room" }, { type: "video_url", role: "reference_video" }, { type: "video_url", role: "reference_video" }, { type: "audio_url", role: "reference_audio" }],
    });
    expect(mocks.readStored).not.toHaveBeenCalled();
});

test.each(["video-fixture", "veo-fixture", "scripted", "grok-video-fixture", "seedance-fixture"])("%s read errors stop submission without legacy fallback or automatic retries", async (model) => {
    readMedia.mockRejectedValue(new Error("host read failed"));
    await expect(run(model, [video()], [], new AbortController().signal, model === "veo-fixture" ? "gemini" : "openai")).rejects.toThrow("host read failed");
    expect(readMedia).toHaveBeenCalledOnce();
    expect(post).not.toHaveBeenCalled();
    expect(mocks.plugin).not.toHaveBeenCalled();
    expect(mocks.readStored).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});

test.each(["kling-fixture", "agnes-fixture", "grok-video-fixture"])("%s still rejects unsupported audio before reading bytes", async (model) => {
    await expect(run(model)).rejects.toThrow("支持");
    expect(readMedia).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
});

test("empty bytes keep the existing generic video validation instead of silently dropping a reference", async () => {
    readMedia.mockResolvedValue(new Blob([]));
    await expect(run()).rejects.toThrow("apiErrors.invalidReferenceVideo");
    expect(post).not.toHaveBeenCalled();
    expect(mocks.readStored).not.toHaveBeenCalled();
});

test("no-reference generation never invokes host media reads", async () => {
    expect(await run("video-fixture", [], [])).toMatchObject({ provider: "openai" });
    expect(readMedia).not.toHaveBeenCalled();
});

test("already cancelled requests do not enter a provider or host, even with no references", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run("video-fixture", [], [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(readMedia).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
});

test.each(["video-fixture", "veo-fixture", "scripted", "grok-video-fixture", "seedance-fixture"])("%s rejects late host bytes after cancellation before submitting", async (model) => {
    const controller = new AbortController();
    readMedia.mockImplementation(async (_id, ref) => { controller.abort(); return bytes(ref); });
    await expect(run(model, [video()], [], controller.signal, model === "veo-fixture" ? "gemini" : "openai")).rejects.toMatchObject({ name: "AbortError" });
    expect(post).not.toHaveBeenCalled();
    expect(mocks.plugin).not.toHaveBeenCalled();
});

test("late provider success after cancellation cannot be published as a task", async () => {
    const controller = new AbortController();
    post.mockImplementation(async () => { controller.abort(); return { data: { id: "late" } }; });
    await expect(run("video-fixture", [], [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});

test("explicit retry rereads host inputs while preserving provider errors", async () => {
    post.mockRejectedValueOnce(new Error("provider failed"));
    await expect(run()).rejects.toThrow("provider failed");
    expect(await run()).toMatchObject({ id: "provider-task" });
    expect(readMedia).toHaveBeenCalledTimes(4);
    expect(post).toHaveBeenCalledTimes(2);
});

test("non-canvas consumers retain the existing storage read when no host reader is supplied", async () => {
    mocks.readStored.mockResolvedValue(bytes(video()));
    await expect(createVideoGenerationTask(config(), "room", [], { videos: [video()] })).resolves.toMatchObject({ id: "provider-task" });
    expect(mocks.readStored).toHaveBeenCalledExactlyOnceWith("video:one");
    expect(readMedia).not.toHaveBeenCalled();
});

test("resolved provider execution refuses to fall back to package media persistence", async () => {
    await expect(createResolvedVideoGenerationTask(config(), "video-fixture", "", "room", [], undefined as never)).rejects.toThrow("需要宿主媒体读取器");
    expect(mocks.readStored).not.toHaveBeenCalled();
    expect(mocks.resolveUrl).not.toHaveBeenCalled();
});

test("Mock media refuses audio/video and deleted projects without touching old storage or network", async () => {
    const adapter = createMockCanvasAdapter({ sampleAsset: { name: "sample.png", url: "data:image/png;base64,room", mimeType: "image/png", width: 80, height: 40 } });
    const signal = new AbortController().signal;
    for (const ref of [video(), audio]) {
        await expect(adapter.media.readMedia(adapter.initialProjectId, ref, signal)).rejects.toThrow("Mock 暂不支持音视频引用");
    }
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.media.readMedia(adapter.initialProjectId, video(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    adapter.projects.getState().deleteProjects([adapter.initialProjectId]);
    await expect(adapter.media.readMedia(adapter.initialProjectId, video(), signal)).rejects.toThrow("项目不存在");
    expect(post).not.toHaveBeenCalled();
    expect(mocks.readStored).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});

const imageProviders = ["video-fixture", "veo-fixture", "scripted", "grok-video-fixture", "seedance-fixture", "kling-fixture"];
const images: ReferenceImage[] = ["first", "last"].map((id) => ({ id, name: `${id}.png`, type: "image/png", dataUrl: `data:image/png;base64,${Buffer.from(id).toString("base64")}`, storageKey: `image:${id}` }));

test.each(imageProviders)("%s canvas video uses materialized image bytes without rereading host or legacy storage", async (model) => {
    const original = structuredClone(images);
    const signal = new AbortController().signal;
    await createCanvasVideoTask(media, "project", config(model, model === "veo-fixture" ? "gemini" : "openai"), "room", images, { signal });
    const urls = images.map((image) => image.dataUrl);
    if (model === "scripted") {
        expect(mocks.plugin.mock.calls[0][0]).toMatchObject({ images: urls, signal });
    } else {
        const body = post.mock.calls[0][1];
        if (model === "video-fixture") {
            expect(await Promise.all(((body as FormData).getAll("image[]") as File[]).map((file) => file.text()))).toEqual(urls);
        } else if (model === "veo-fixture") {
            expect(body).toMatchObject({ instances: [{ referenceImages: images.map((image) => ({ image: { bytesBase64Encoded: image.dataUrl.split(",")[1], mimeType: image.type }, referenceType: "asset" })) }] });
        } else if (model === "grok-video-fixture") {
            expect(body).toMatchObject({ reference_images: urls.map((url) => ({ url })) });
        } else if (model === "seedance-fixture") {
            expect(body).toMatchObject({ image_urls: urls, reference_images: urls });
        } else {
            expect(body).toMatchObject({ image: urls[0], image_tail: urls[1] });
        }
        expect(post).toHaveBeenCalledOnce();
        expect(post.mock.calls[0][2]).toMatchObject({ signal });
    }
    expect(media.readImage).not.toHaveBeenCalled();
    expect(readMedia).not.toHaveBeenCalled();
    expect(images).toEqual(original);
    expect(fetch).not.toHaveBeenCalled();
});

test.each(imageProviders)("%s injected image failure stops before submission without storage fallback", async (model) => {
    const reader = vi.fn().mockRejectedValue(new Error("host image failed"));
    await expect(createVideoGenerationTask(config(model, model === "veo-fixture" ? "gemini" : "openai"), "room", images, { readImage: reader })).rejects.toThrow("host image failed");
    expect(post).not.toHaveBeenCalled();
    expect(mocks.plugin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});

test.each(imageProviders)("%s late image bytes after cancellation cannot submit", async (model) => {
    const controller = new AbortController();
    await expect(createVideoGenerationTask(config(model, model === "veo-fixture" ? "gemini" : "openai"), "room", [images[0]], {
        signal: controller.signal,
        readImage: async (image) => { controller.abort(); return image.dataUrl; },
    })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
    expect(mocks.plugin).not.toHaveBeenCalled();
});

test.each(["kling-fixture", "agnes-fixture"])("%s rejects unsupported images before invoking the injected reader", async (model) => {
    const reader = vi.fn();
    await expect(createVideoGenerationTask(config(model), "room", [...images, images[0]], { readImage: reader })).rejects.toThrow("支持");
    expect(reader).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
});
