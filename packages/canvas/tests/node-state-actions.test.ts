import { describe, expect, test } from "vitest";
import { applyCanvasNodeConfigPatch, markCanvasNodeError, updateCanvasNodeContent, updateCanvasNodeFontSize, updateCanvasNodePrompt, updateCanvasNodeTitle } from "../src/features/canvas/node-state-actions";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const textNode: CanvasNodeData = {
    id: "text-1",
    type: CanvasNodeType.Text,
    title: "原标题",
    position: { x: 20, y: 30 },
    width: 320,
    height: 200,
    metadata: {
        content: "旧内容",
        primaryTextId: "primary",
        texts: [
            { id: "primary", status: "success", content: "旧内容" },
            { id: "secondary", status: "success", content: "保留内容" },
        ],
    },
};

const imageNode: CanvasNodeData = {
    id: "image-1",
    type: CanvasNodeType.Image,
    title: "图片",
    position: { x: 100, y: 80 },
    width: 512,
    height: 512,
    metadata: {},
};

describe("Canvas node state actions", () => {
    test("updates node content and mirrors only the primary text slot", () => {
        const [updated, unchanged] = updateCanvasNodeContent([textNode, imageNode], "text-1", "新内容");

        expect(updated.metadata).toMatchObject({ content: "新内容", texts: [{ id: "primary", content: "新内容" }, { id: "secondary", content: "保留内容" }] });
        expect(unchanged).toBe(imageNode);
    });

    test("updates title and prompt without changing unrelated nodes", () => {
        const titled = updateCanvasNodeTitle([textNode, imageNode], "text-1", "新标题");
        const prompted = updateCanvasNodePrompt(titled, "text-1", "新的提示词");
        const resizedText = updateCanvasNodeFontSize(prompted, "text-1", 18);

        expect(resizedText[0]).toMatchObject({ title: "新标题", metadata: { prompt: "新的提示词", fontSize: 18 } });
        expect(resizedText[1]).toBe(imageNode);
    });

    test("delegates config patches and preserves the existing size adjustment semantics", () => {
        const [updated, unchanged] = applyCanvasNodeConfigPatch([imageNode, textNode], "image-1", { size: "1024x512", prompt: "客厅" });

        expect(updated).toMatchObject({ position: { x: 186, y: 251 }, width: 340, height: 170, metadata: { size: "1024x512", prompt: "客厅" } });
        expect(unchanged).toBe(textNode);
    });

    test("does not resize nodes with existing content", () => {
        const source = { ...imageNode, metadata: { content: "asset://image" } };
        expect(applyCanvasNodeConfigPatch([source], "image-1", { size: "1024x512" })[0]).toMatchObject({ position: source.position, width: source.width, height: source.height });
    });

    test("marks only the target node as failed", () => {
        const [failed, unchanged] = markCanvasNodeError([textNode, imageNode], "text-1", "配置缺失");

        expect(failed.metadata).toMatchObject({ status: "error", errorDetails: "配置缺失" });
        expect(unchanged).toBe(imageNode);
    });
});
