import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { captureVideoFrame } from "../src/lib/canvas/canvas-video-frame";

class TestVideo extends EventTarget {
    src = ""; crossOrigin = ""; muted = false; playsInline = false; preload = "";
    videoWidth = 1920; videoHeight = 1080; duration = 5; readyState = 2;
    time = 0; autoLoad = true;
    removeAttribute = vi.fn();
    load = vi.fn(() => { if (this.src && this.autoLoad) queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata"))); });
    get currentTime() { return this.time; }
    set currentTime(value: number) { this.time = value; queueMicrotask(() => this.dispatchEvent(new Event("seeked"))); }
}
let video: TestVideo;
const drawImage = vi.fn();
const getContext = vi.fn();
const toBlob = vi.fn();
const png = new Blob(["frame"], { type: "image/png" });
let canvas: { width: number; height: number; getContext: typeof getContext; toBlob: typeof toBlob };

beforeEach(() => {
    vi.clearAllMocks();
    video = new TestVideo();
    getContext.mockReturnValue({ drawImage });
    toBlob.mockImplementation((callback: BlobCallback) => callback(png));
    canvas = { width: 0, height: 0, getContext, toBlob };
    vi.stubGlobal("document", { createElement: vi.fn((kind: string) => kind === "video" ? video : canvas) });
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
});
afterEach(() => vi.unstubAllGlobals());

test.each([["first", 0], ["current", 2], ["last", 4.999]] as const)("captures %s at the existing frame position and releases its temporary player", async (position, expected) => {
    expect(await captureVideoFrame("blob:video", position, 2)).toBe(png);
    expect(video.currentTime).toBe(expected);
    expect(canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(video.load).toHaveBeenCalledTimes(2);
});

test("current frame beyond duration retains the existing end-frame clamp", async () => {
    await captureVideoFrame("blob:video", "current", 20);
    expect(video.currentTime).toBe(4.999);
});

test("first frame waits for frame data when metadata is not sufficient", async () => {
    video.readyState = 1;
    const result = captureVideoFrame("blob:video", "first", 0);
    await Promise.resolve();
    await Promise.resolve();
    expect(drawImage).not.toHaveBeenCalled();
    video.dispatchEvent(new Event("loadeddata"));
    expect(await result).toBe(png);
});

test("decode errors reject and release the temporary player and listeners", async () => {
    video.autoLoad = false;
    const remove = vi.spyOn(video, "removeEventListener");
    const result = captureVideoFrame("blob:broken", "first", 0);
    video.dispatchEvent(new Event("error"));
    await expect(result).rejects.toThrow("Failed to read video frame");
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(remove).toHaveBeenCalledWith("loadedmetadata", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("error", expect.any(Function));
    expect(drawImage).not.toHaveBeenCalled();
});

test.each(["dimensions", "context", "encoding"])("rejects %s failure without publishing a frame", async (failure) => {
    if (failure === "dimensions") video.videoWidth = 0;
    if (failure === "context") getContext.mockReturnValue(null);
    if (failure === "encoding") toBlob.mockImplementation((callback: BlobCallback) => callback(null));
    await expect(captureVideoFrame("blob:video", "first", 0)).rejects.toThrow();
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
});

test("project switch while waiting aborts and cleans up media and listeners", async () => {
    video.autoLoad = false;
    const controller = new AbortController();
    const remove = vi.spyOn(video, "removeEventListener");
    const result = captureVideoFrame("blob:video", "first", 0, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(remove).toHaveBeenCalledWith("loadedmetadata", expect.any(Function));
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(drawImage).not.toHaveBeenCalled();
});

test("already cancelled capture creates no player", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(captureVideoFrame("blob:video", "first", 0, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(document.createElement).not.toHaveBeenCalled();
});

test("cancellation during encoding does not return a late frame", async () => {
    const controller = new AbortController();
    toBlob.mockImplementation((callback: BlobCallback) => { controller.abort(); callback(png); });
    await expect(captureVideoFrame("blob:video", "first", 0, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
});
