export type CanvasSystemClipboard = {
    read?: () => Promise<ClipboardItems>;
    readText?: () => Promise<string>;
};

export type CanvasSystemClipboardHost = {
    createImageFile(file: File): Promise<void>;
    createTextNode(text: string): boolean;
};

export type CanvasSystemClipboardResult = "image" | "text" | null;

export async function pasteCanvasSystemClipboard(
    clipboard: CanvasSystemClipboard | undefined,
    host: CanvasSystemClipboardHost,
): Promise<CanvasSystemClipboardResult> {
    if (!clipboard) return null;

    if (clipboard.read) {
        const items = await clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return null;
            const blob = await imageItem.getType(imageType);
            await host.createImageFile(new File([blob], "clipboard-image.png", { type: imageType }));
            return "image";
        }
    }

    if (clipboard.readText) {
        const text = await clipboard.readText();
        if (host.createTextNode(text)) return "text";
    }

    return null;
}
