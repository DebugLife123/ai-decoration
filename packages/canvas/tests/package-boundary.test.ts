import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = resolve(packageRoot, "src");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const dependencies = new Set([...Object.keys(manifest.dependencies), ...Object.keys(manifest.peerDependencies)]);

test("canvas source imports stay inside the package or use declared dependencies", () => {
    const violations: string[] = [];
    for (const entry of readdirSync(sourceRoot, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
        const filename = resolve(entry.parentPath, entry.name);
        const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
        const check = (specifier: string) => {
            if (specifier.startsWith(".")) {
                const target = relative(sourceRoot, resolve(dirname(filename), specifier));
                if (target === ".." || target.startsWith(`..${sep}`)) violations.push(`${filename}: ${specifier}`);
            } else {
                const dependency = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
                if (!dependencies.has(dependency)) violations.push(`${filename}: ${specifier}`);
            }
        };
        const visit = (node: ts.Node) => {
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text);
            if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) check(node.arguments[0].text);
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    expect(violations).toEqual([]);
});

test("host persistence contract has a public package export", () => {
    const canvasFeature = readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8");
    expect(canvasFeature).toContain("CanvasProviderModelResolver");
    expect(canvasFeature).toContain("resolveCanvasFileImportFailures");
    expect(canvasFeature).toContain("applyCanvasGenerationFailure");
    expect(canvasFeature).toContain("applyCanvasAudioResult");
    expect(canvasFeature).toContain("buildCanvasAudioSettings");
    expect(canvasFeature).toContain("executeCanvasAudioTask");
    expect(canvasFeature).toContain("executeCanvasVideoTask");
    expect(canvasFeature).toContain("applyCanvasGenerationStart");
    expect(canvasFeature).toContain("resolveCanvasSplitWriteback");
    expect(canvasFeature).toContain("createCanvasMaskEditPlan");
    expect(canvasFeature).toContain("createCanvasAngleEditPlan");
    expect(canvasFeature).toContain("applyCanvasImageEditFailure");
    expect(canvasFeature).toContain("applyCanvasImageEditAction");
    expect(canvasFeature).toContain("applyCanvasVideoTaskHandle");
    expect(canvasFeature).toContain("buildCanvasVideoSettings");
    expect(canvasFeature).toContain("applyCanvasGenerationTargetsFailure");
    expect(canvasFeature).toContain("applyCanvasBatchImageSummary");
    expect(canvasFeature).toContain("deleteCanvasBatchImage");
    expect(canvasFeature).toContain("resolveCanvasGenerationFailure");
    expect(canvasFeature).toContain("CanvasGenerationFailureOutcome");
    expect(manifest.exports["./asset-store-persistence"]).toBe("./src/services/asset-store-persistence.ts");
    expect(manifest.exports["./canvas-store-persistence"]).toBe("./src/services/canvas-store-persistence.ts");
    expect(manifest.exports["./plugin-store-persistence"]).toBe("./src/services/plugin-store-persistence.ts");
    expect(manifest.exports["./canvas/node-drag"]).toBe("./src/features/canvas/node-drag.ts");
    expect(manifest.exports["./canvas/connection-gesture"]).toBe("./src/features/canvas/connection-gesture.ts");
    expect(manifest.exports["./canvas/connection-actions"]).toBe("./src/features/canvas/connection-actions.ts");
    expect(manifest.exports["./canvas/node-state-actions"]).toBe("./src/features/canvas/node-state-actions.ts");
    expect(manifest.exports["./canvas/node-clipboard"]).toBe("./src/features/canvas/node-clipboard.ts");
    expect(canvasFeature).toContain("duplicateCanvasNode");
    expect(canvasFeature).toContain("updateCanvasNodeFontSize");
    expect(canvasFeature).toContain("markCanvasNodeError");
    expect(manifest.exports["./canvas/system-clipboard"]).toBe("./src/features/canvas/system-clipboard.ts");
    expect(manifest.exports["./canvas/history-stack"]).toBe("./src/features/canvas/history-stack.ts");
    expect(manifest.exports["./canvas/node-relations"]).toBe("./src/features/canvas/node-relations.ts");
    expect(manifest.exports["./canvas/generation-request-registry"]).toBe("./src/features/canvas/generation-request-registry.ts");
    expect(manifest.exports["./canvas/viewport-commands"]).toBe("./src/features/canvas/viewport-commands.ts");
    expect(manifest.exports["./canvas/node-resize"]).toBe("./src/features/canvas/node-resize.ts");
    expect(manifest.exports["./canvas/keyboard-shortcuts"]).toBe("./src/features/canvas/keyboard-shortcuts.ts");
    expect(manifest.exports["./canvas/file-import-policy"]).toBe("./src/features/canvas/file-import-policy.ts");
    expect(manifest.exports["./canvas/generation-outcome"]).toBe("./src/features/canvas/generation-outcome.ts");
    expect(manifest.exports["./canvas/generation-failure"]).toBe("./src/features/canvas/generation-failure.ts");
    expect(manifest.exports["./canvas/audio-result"]).toBe("./src/features/canvas/audio-result.ts");
    expect(manifest.exports["./canvas/audio-generation-config"]).toBe("./src/features/canvas/audio-generation-config.ts");
    expect(manifest.exports["./canvas/audio-execution"]).toBe("./src/features/canvas/audio-execution.ts");
    expect(manifest.exports["./canvas/split-result"]).toBe("./src/features/canvas/split-result.ts");
    expect(manifest.exports["./canvas/mask-edit-plan"]).toBe("./src/features/canvas/mask-edit-plan.ts");
    expect(manifest.exports["./canvas/angle-edit-plan"]).toBe("./src/features/canvas/angle-edit-plan.ts");
    expect(manifest.exports["./canvas/image-edit-reference"]).toBe("./src/features/canvas/image-edit-reference.ts");
    expect(manifest.exports["./canvas/image-lineage"]).toBe("./src/features/canvas/image-lineage.ts");
    expect(manifest.exports["./canvas/mask-stroke-history"]).toBe("./src/features/canvas/mask-stroke-history.ts");
    expect(manifest.exports["./canvas/video-task-metadata"]).toBe("./src/features/canvas/video-task-metadata.ts");
    expect(manifest.exports["./canvas/video-generation-config"]).toBe("./src/features/canvas/video-generation-config.ts");
    expect(manifest.exports["./canvas/video-execution"]).toBe("./src/features/canvas/video-execution.ts");
    expect(manifest.exports["./canvas/generation-start-state"]).toBe("./src/features/canvas/generation-start-state.ts");
    expect(manifest.exports["./canvas/image-edit-result"]).toBe("./src/features/canvas/image-edit-result.ts");
    expect(manifest.exports["./canvas/image-edit-failure"]).toBe("./src/features/canvas/image-edit-failure.ts");
    expect(manifest.exports["./canvas/image-edit-action"]).toBe("./src/features/canvas/image-edit-action.ts");
    expect(manifest.exports["./canvas/image-writeback-result"]).toBe("./src/features/canvas/image-writeback-result.ts");
    expect(manifest.exports["./canvas/generation-batch-state"]).toBe("./src/features/canvas/generation-batch-state.ts");
    expect(manifest.exports["./canvas/generation-text-batch"]).toBe("./src/features/canvas/generation-text-batch.ts");
    expect(manifest.exports["./canvas/generation-text-result"]).toBe("./src/features/canvas/generation-text-result.ts");
    expect(manifest.exports["./canvas/batch-image-actions"]).toBe("./src/features/canvas/batch-image-actions.ts");
    expect(manifest.exports["./canvas/project-asset-node"]).toBe("./src/features/canvas/project-asset-node.ts");
    expect(manifest.exports["./canvas/generation-text-plan"]).toBe("./src/features/canvas/generation-text-plan.ts");
    expect(manifest.exports["./canvas/generation-result"]).toBe("./src/features/canvas/generation-result.ts");
    expect(manifest.exports["./canvas/batch-image-result"]).toBe("./src/features/canvas/batch-image-result.ts");
    expect(manifest.exports["./provider-media-persistence"]).toBe("./src/services/provider-media-persistence.ts");
    expect(manifest.exports["./provider/sse"]).toBe("./src/services/api/sse.ts");
    expect(manifest.exports["./asset-store-cleanup"]).toBe("./src/services/asset-store-cleanup.ts");
    expect(manifest.exports["./project-assets"]).toBe("./src/services/canvas-project-assets.ts");
    expect(manifest.exports["./project-asset-catalog"]).toBe("./src/services/canvas-project-asset-catalog.ts");
    expect(manifest.exports["./project-asset-catalog-factory"]).toBe("./src/services/project-asset-catalog.ts");
    expect(manifest.exports["./project-asset-storage"]).toBe("./src/services/canvas-project-asset-storage.ts");
    expect(manifest.exports["./local-project-asset-catalog"]).toBeUndefined();
    expect(manifest.exports["./generation-media"]).toBe("./src/lib/canvas/canvas-generation-helpers.ts");
    expect(manifest.exports["./canvas-export"]).toBe("./src/lib/canvas/canvas-export.ts");
    expect(manifest.exports["./canvas/components/*"]).toBe("./src/components/canvas/*");
    expect(manifest.exports["./canvas/lib/*"]).toBe("./src/lib/canvas/*");
    expect(manifest.exports["./canvas/types/*"]).toBe("./src/types/*");
    expect(manifest.exports["./types/image"]).toBe("./src/types/image.ts");
    expect(manifest.exports["./types/media"]).toBe("./src/types/media.ts");
    expect(manifest.exports["./mock"]).toBe("./src/services/api/canvas/mock-adapter.ts");
    expect(manifest.exports["./task-workflow"]).toBe("./src/services/api/canvas/task-workflow.ts");
    expect(canvasFeature).toContain("createCanvasTaskExecution");
    expect(canvasFeature).toContain("CanvasTaskExecution");
    expect(canvasFeature).toContain("CanvasHostTaskRecord");
    expect(canvasFeature).toContain("CanvasTaskStatusPanel");
    expect(manifest.exports["./utils"]).toBe("./src/lib/utils.ts");
    expect(manifest.exports["./stores/asset"]).toBe("./src/stores/use-asset-store.ts");
    expect(manifest.exports["./stores/canvas"]).toBe("./src/stores/canvas/use-canvas-store.ts");
    expect(manifest.exports["./stores/plugin"]).toBe("./src/stores/canvas/use-plugin-store.ts");
    expect(manifest.exports["./stores/config"]).toBe("./src/stores/use-config-store.ts");
    expect(manifest.exports["./stores/canvas-side-panel"]).toBe("./src/stores/use-canvas-side-panel-store.ts");
    expect(manifest.exports["./stores/agent"]).toBe("./src/stores/use-agent-store.ts");
    expect(manifest.exports["./stores/prompt-source"]).toBeUndefined();
    expect(manifest.exports["./theme-store"]).toBe("./src/stores/use-theme-store.ts");
    expect(manifest.exports["./video-provider"]).toBe("./src/features/canvas/video-provider.ts");
    expect(manifest.exports["./video-types"]).toBe("./src/services/api/video/types.ts");
    expect(manifest.exports["./video-api"]).toBe("./src/services/api/video-api.ts");
    expect(manifest.exports["./video-workbench"]).toBe("./src/services/api/video-workbench.ts");
    expect(manifest.exports["./host/settings/audio"]).toBe("./src/components/audio-settings-panel.tsx");
    expect(manifest.exports["./host/settings/image"]).toBe("./src/components/image-settings-panel.tsx");
    expect(manifest.exports["./host/settings/model-picker"]).toBeUndefined();
    expect(manifest.exports["./host/settings/text"]).toBe("./src/components/text-settings-panel.tsx");
    expect(manifest.exports["./host/settings/video"]).toBe("./src/components/video-settings-panel.tsx");
    expect(manifest.exports["./canvas/archive"]).toBe("./src/lib/zip.ts");
    expect(manifest.exports["./provider/audio"]).toBe("./src/services/api/audio.ts");
    expect(manifest.exports["./provider/video-execution"]).toBe("./src/services/api/video-execution.ts");
    expect(manifest.exports["./provider/video-errors"]).toBe("./src/services/api/video-errors.ts");
    expect(manifest.exports["./provider/image"]).toBe("./src/services/api/image-api.ts");
    expect(manifest.exports["./provider/image-execution"]).toBe("./src/services/api/image-execution.ts");
    expect(manifest.exports["./provider/image-workbench"]).toBe("./src/services/api/image-workbench.ts");
    expect(manifest.exports["./provider/image-models"]).toBe("./src/services/api/image-models.ts");
    expect(manifest.exports["./provider/image-question"]).toBe("./src/services/api/image-question.ts");
    const imageExecution = readFileSync(resolve(sourceRoot, "services/api/image-execution.ts"), "utf8");
    expect(imageExecution).not.toContain("fetchImageModels");
    expect(imageExecution).not.toContain("use-config-store");
    expect(imageExecution).toContain('from "./image-question"');
    expect(imageExecution).toContain('export { requestResolvedImageQuestion } from "./image-question"');
    expect(imageExecution).not.toContain("consumeResponseStreamBlock");
    expect(imageExecution).not.toContain("consumeGeminiStreamBlock");
    const imageModels = readFileSync(resolve(sourceRoot, "services/api/image-models.ts"), "utf8");
    expect(imageModels).not.toContain("image-execution");
    const imageApi = readFileSync(resolve(sourceRoot, "services/api/image-api.ts"), "utf8");
    expect(imageApi).toContain('export * from "./image-models"');
    expect(manifest.exports["./provider/grok-image"]).toBe("./src/services/api/grok-image.ts");
    expect(manifest.exports["./provider/grok-video"]).toBe("./src/services/api/grok-video.ts");
    expect(manifest.exports["./provider/specialized-video"]).toBe("./src/services/api/specialized-video.ts");
    expect(manifest.exports["./provider/model-plugin"]).toBe("./src/services/api/model-plugin.ts");
    expect(manifest.exports["./provider/agnes-video"]).toBe("./src/lib/agnes-video.ts");
    expect(manifest.exports["./provider/audio-host-profile"]).toBe("./src/lib/audio-host-profile.ts");
    expect(manifest.exports["./provider/audio-generation"]).toBe("./src/lib/audio-generation.ts");
    expect(manifest.exports["./provider/channel-compat"]).toBe("./src/lib/channel-compat.ts");
    expect(manifest.exports["./provider/grok-video-profile"]).toBe("./src/lib/grok-video.ts");
    expect(manifest.exports["./provider/grok-model-profile"]).toBe("./src/lib/grok-model-profile.ts");
    expect(manifest.exports["./provider/kling-video"]).toBe("./src/lib/kling-video.ts");
    expect(manifest.exports["./provider/seedance-video"]).toBe("./src/lib/seedance-video.ts");
    expect(manifest.exports["./canvas-constants"]).toBe("./src/constant/canvas.ts");
    expect(manifest.exports["./canvas/keyboard-event"]).toBe("./src/lib/keyboard-event.ts");
    expect(manifest.exports["./canvas/image-reference-prompt"]).toBe("./src/lib/image-reference-prompt.ts");
    expect(manifest.exports["./canvas/media-size"]).toBe("./src/lib/media-size.ts");
    expect(manifest.exports["./canvas/video-task-handle"]).toBe("./src/lib/canvas/video-task-handle.ts");
    expect(manifest.exports["./canvas/model-resolution"]).toBe("./src/features/canvas/model-resolution.ts");
    expect(manifest.exports["./hooks/use-copy-text"]).toBe("./src/hooks/use-copy-text.ts");
    expect(manifest.exports["./canvas/host/use-agent-bridge"]).toBe("./src/features/canvas/use-agent-bridge.ts");
    expect(manifest.exports["./canvas/host/use-plugin-host"]).toBe("./src/features/canvas/use-plugin-host.tsx");
    expect(manifest.exports["./i18n"]).toBe("./src/i18n/index.ts");
    expect(manifest.exports["./i18n/locales/en-US"]).toBe("./src/i18n/locales/en-US.ts");
    expect(manifest.exports["./i18n/locales/zh-CN"]).toBe("./src/i18n/locales/zh-CN.ts");
    expect(manifest.exports["./local/storage"]).toBeUndefined();
    expect(manifest.exports["./local/image-storage"]).toBeUndefined();
    expect(manifest.exports["./local/file-storage"]).toBeUndefined();
});

test("canvas editor delegates project and viewport persistence to its feature boundary", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const persistence = readFileSync(resolve(sourceRoot, "features/canvas/viewport-save.ts"), "utf8");
    const projectPersistence = readFileSync(resolve(sourceRoot, "features/canvas/use-project-persistence.ts"), "utf8");
    expect(editor).toContain("useCanvasProjectPersistence({");
    expect(editor).not.toContain("createCanvasAutosaveDocument");
    expect(editor).not.toContain("saveCanvasViewportSnapshot");
    expect(editor).not.toContain("viewportSaveTimerRef");
    expect(persistence).toContain("createCanvasViewportSaveScheduler");
    expect(persistence).toContain("}, 500)");
    expect(projectPersistence).toContain("createCanvasAutosaveDocument");
    expect(projectPersistence).toContain("saveCanvasViewportSnapshot");
    expect(manifest.exports["./canvas/project-persistence"]).toBe("./src/features/canvas/use-project-persistence.ts");
});

test("canvas window interaction listener lifecycle belongs to its feature hook", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const interactionEvents = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-window-interaction-events.ts"), "utf8");
    expect(editor).toContain("useCanvasWindowInteractionEvents({");
    expect(editor).not.toContain('window.addEventListener("mousemove"');
    expect(editor).not.toContain('window.removeEventListener("mousemove"');
    expect(interactionEvents).toContain('window.addEventListener("mousemove"');
    expect(interactionEvents).toContain('window.removeEventListener("mousemove"');
    expect(manifest.exports["./canvas/window-interaction-events"]).toBe("./src/features/canvas/use-canvas-window-interaction-events.ts");
});

test("canvas keyboard DOM filtering and listener lifecycle belong to its feature hook", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const keyboardHook = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-keyboard-shortcuts.ts"), "utf8");
    expect(editor).toContain("useCanvasKeyboardShortcuts({");
    expect(editor).not.toContain("window.addEventListener(\"keydown\", handleKeyDown)");
    expect(keyboardHook).toContain("resolveCanvasKeyboardShortcut");
    expect(keyboardHook).toContain("data-canvas-shortcuts-ignore");
    expect(keyboardHook).toContain("window.addEventListener(\"keydown\", handleKeyDown)");
    expect(manifest.exports["./canvas/keyboard-shortcuts-hook"]).toBe("./src/features/canvas/use-canvas-keyboard-shortcuts.ts");
});

test("canvas file import orchestration belongs to its feature hook", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const importHook = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-file-import.ts"), "utf8");
    expect(editor).toContain("useCanvasFileImport({");
    expect(editor).not.toContain("runCanvasFileImportBatch(");
    expect(editor).not.toContain("runCanvasImportPlan(");
    expect(importHook).toContain("runCanvasFileImportBatch");
    expect(importHook).toContain("runCanvasImportPlan");
    expect(manifest.exports["./canvas/file-import-hook"]).toBe("./src/features/canvas/use-canvas-file-import.ts");
});

test("canvas generation request lifecycle belongs to its feature hook", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const requestsHook = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-generation-requests.ts"), "utf8");
    expect(editor).toContain("useCanvasGenerationRequests(projectId)");
    expect(editor).not.toContain("createCanvasGenerationRequestRegistry");
    expect(editor).not.toContain("generationRequests.abortAll()");
    expect(requestsHook).toContain("createCanvasGenerationRequestRegistry");
    expect(requestsHook).toContain("requests.abortAll()");
    expect(requestsHook).toContain("requests.stopByRunningId(runningId)");
    expect(manifest.exports["./canvas/generation-requests-hook"]).toBe("./src/features/canvas/use-canvas-generation-requests.ts");
});

test("canvas version restore request lifecycle belongs to its feature hook", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const restoreHook = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-version-restore.ts"), "utf8");
    expect(editor).toContain("useCanvasVersionRestore({");
    expect(editor).not.toContain("versionRestoreRef");
    expect(editor).not.toContain("restoreCanvasVersionDocument(");
    expect(restoreHook).toContain("restoreCanvasVersionDocument");
    expect(restoreHook).toContain("controllerRef.current?.abort()");
    expect(manifest.exports["./canvas/version-restore-hook"]).toBe("./src/features/canvas/use-canvas-version-restore.ts");
});

test("canvas project operation scopes belong to their feature hook", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const scopes = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-project-operation-scopes.ts"), "utf8");
    expect(editor).toContain("useCanvasProjectOperationScopes(projectId)");
    expect(editor).not.toContain("const cropRequestRef = useRef");
    expect(editor).not.toContain("imageImportScopeRef.current.abort()");
    expect(scopes).toContain("imageImport.current.abort()");
    expect(scopes).toContain("cropRequest.current = null");
    expect(manifest.exports["./canvas/project-operation-scopes"]).toBe("./src/features/canvas/use-canvas-project-operation-scopes.ts");
});

test("canvas crop and upscale execution belongs to a shared image derivative hook", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const derivativeActions = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-image-derivative-actions.ts"), "utf8");
    expect(editor).toContain("useCanvasImageDerivativeActions({");
    expect(editor).not.toContain("createCroppedImageNode(");
    expect(editor).not.toContain("createUpscaledImageNode(");
    expect(derivativeActions).toContain("createCroppedImageNode");
    expect(derivativeActions).toContain("createUpscaledImageNode");
    expect(derivativeActions).toContain("cropRequest.current === request");
    expect(derivativeActions).toContain("upscaleRequest.current === request");
    expect(manifest.exports["./canvas/image-derivative-actions"]).toBe("./src/features/canvas/use-canvas-image-derivative-actions.ts");
});

test("canvas split saving and mask asset persistence use dedicated hooks", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const splitActions = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-image-split-actions.ts"), "utf8");
    const maskActions = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-mask-asset-actions.ts"), "utf8");
    const maskDialog = readFileSync(resolve(sourceRoot, "components/canvas/canvas-node-mask-edit-dialog.tsx"), "utf8");
    expect(editor).toContain("useCanvasImageSplitActions({");
    expect(editor).toContain("resolveCanvasSplitWriteback(previous, result)");
    expect(editor).not.toContain("const savedIds = new Set(previous.items");
    expect(editor).not.toContain("prepareImageSplit(");
    expect(editor).not.toContain("saveImageSplit(");
    expect(splitActions).toContain("prepareImageSplit(projectId, node, params)");
    expect(splitActions).toContain("saveImageSplit(importImage, batch)");
    expect(splitActions).toContain("if (splitRequest.current !== request) return");
    expect(editor).toContain("useCanvasMaskAssetActions({");
    expect(editor).toContain("createCanvasMaskEditPlan({");
    expect(editor).not.toContain('name: "mask.png", type:');
    expect(editor).not.toContain("createMaskImageNode(");
    expect(maskActions).toContain("createMaskImageNode(importImage, projectId, source, maskDataUrl, title, request.controller.signal)");
    expect(maskActions).toContain("!request.controller.signal.aborted");
    expect(maskActions).toContain("if (!isSourcePresent(source.id))");
    expect(maskDialog).toContain('if (generate && !nextPrompt) return setError(t("canvas.editors.maskPromptRequired"))');
    expect(editor).toContain("if (!payload.generate) {");
    expect(editor).toContain("fromNodeId: node.id, toNodeId: maskNodeId");
    expect(manifest.exports["./canvas/image-split-actions"]).toBe("./src/features/canvas/use-canvas-image-split-actions.ts");
    expect(manifest.exports["./canvas/mask-asset-actions"]).toBe("./src/features/canvas/use-canvas-mask-asset-actions.ts");
});

test("canvas mask and angle image edits share the host execution boundary", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const execution = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-image-edit-execution.ts"), "utf8");
    expect(editor).toContain("useCanvasImageEditExecution({");
    expect(editor).toContain("createCanvasAngleEditPlan({");
    expect(editor).not.toContain("createCanvasImageReference(");
    expect(editor).toContain("applyCanvasImageEditAction(prev");
    expect(editor).toContain('kind: "succeeded"');
    expect(editor).toContain('kind: "failed"');
    expect(editor).not.toContain("status: NODE_STATUS_ERROR, errorDetails } : item");
    expect(editor.match(/runCanvasImageEdit\(\{/g)).toHaveLength(2);
    expect(editor).not.toContain("readCanvasReferenceImages(media, projectId, references, controller.signal)");
    expect(execution).toContain("generateCanvasImage(generation,");
    expect(execution).toContain("resolveCanvasGenerationOutcome(error, controller.signal, fallbackMessage, isCanceled)");
    expect(execution).toContain("finishRequest(targetNodeId, controller)");
    expect(manifest.exports["./canvas/image-edit-execution"]).toBe("./src/features/canvas/use-canvas-image-edit-execution.ts");
});

test("canvas video and audio provider execution is isolated from the editor", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const videoExecution = readFileSync(resolve(sourceRoot, "features/canvas/video-execution.ts"), "utf8");
    const audioExecution = readFileSync(resolve(sourceRoot, "features/canvas/audio-execution.ts"), "utf8");
    expect(editor).toContain("executeCanvasVideoTask({");
    expect(editor).toContain("resumeCanvasVideoTask({");
    expect(editor).toContain("executeCanvasAudioTask({");
    expect(editor).not.toContain("videoGeneration.create(");
    expect(editor).not.toContain("videoGeneration.wait(");
    expect(editor).not.toContain("importCanvasResultAudio(");
    expect(editor).not.toContain("importCanvasResultVideo(");
    expect(videoExecution).toContain("onTaskCreated?.(task)");
    expect(videoExecution).toContain("importCanvasResultVideo(");
    expect(audioExecution).toContain("importCanvasResultAudio(");
});

test("canvas generation start state belongs to a pure feature boundary", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const generationStart = readFileSync(resolve(sourceRoot, "features/canvas/generation-start-state.ts"), "utf8");
    expect(editor).toContain("applyCanvasGenerationStart(prev, { nodeId: node.id, imageId })");
    expect(editor).toContain("applyCanvasGenerationStart(prev, { nodeId, prompt })");
    expect(editor).not.toContain("errorCode: undefined,\n                                      images:");
    expect(generationStart).toContain('status: "loading"');
    expect(generationStart).toContain("image.id === imageId");
});

test("canvas text-node retry writeback belongs to the text result feature", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const textResult = readFileSync(resolve(sourceRoot, "features/canvas/generation-text-result.ts"), "utf8");
    expect(editor).toContain("applyCanvasTextNodeDelta(prev, node.id, text)");
    expect(editor).toContain("applyCanvasTextNodeResult(prev, node.id, answer.text || streamed, prompt)");
    expect(textResult).toContain("export function applyCanvasTextNodeDelta");
    expect(textResult).toContain("export function applyCanvasTextNodeResult");
});

test("project asset node creation belongs to a pure feature boundary", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const assetNode = readFileSync(resolve(sourceRoot, "features/canvas/project-asset-node.ts"), "utf8");
    expect(editor).toContain("createCanvasProjectAssetNode(asset, nanoid(), center, NODE_DEFAULT_SIZE[CanvasNodeType.Audio], command)");
    expect(assetNode).toContain("canvasAssetMetadata(asset)");
    expect(assetNode).toContain("VIDEO_NODE_MAX_WIDTH");
});

test("batch image deletion belongs to the batch image actions feature", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const actions = readFileSync(resolve(sourceRoot, "features/canvas/batch-image-actions.ts"), "utf8");
    expect(editor).toContain("deleteCanvasBatchImage(prev, nodeId, imageId)");
    expect(actions).toContain("export function deleteCanvasBatchImage");
});

test("connection deletion belongs to a pure connection actions boundary", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const actions = readFileSync(resolve(sourceRoot, "features/canvas/connection-actions.ts"), "utf8");
    expect(editor).toContain("removeCanvasConnection(prev, connectionId)");
    expect(editor).toContain("disconnectCanvasReference(prev, fromNodeId, toNodeId)");
    expect(editor).toContain("hasCanvasConnection(connectionsRef.current, fromNodeId, toNodeId)");
    expect(actions).toContain("export function hasCanvasConnection");
    expect(actions).toContain("export function removeCanvasConnection");
    expect(actions).toContain("export function disconnectCanvasReference");
});

test("canvas image retry execution stays internal to mixed media retry orchestration", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const feature = readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8");
    const retry = readFileSync(resolve(sourceRoot, "features/canvas/image-retry-execution.ts"), "utf8");
    const plan = readFileSync(resolve(sourceRoot, "features/canvas/retry-plan.ts"), "utf8");
    const preparation = readFileSync(resolve(sourceRoot, "features/canvas/retry-preparation.ts"), "utf8");
    expect(editor).toContain("executeCanvasImageRetry({");
    expect(editor).toContain("createCanvasRetryPlan({");
    expect(editor).toContain("prepareCanvasRetry({");
    expect(editor).not.toContain("const retryImage: CanvasNodeImage = {");
    expect(editor).not.toContain("resolveCanvasRetryImageMetadata(");
    expect(plan).toContain("findRetrySourceNode(node.id");
    expect(plan).toContain("retryGenerationMode(node.type)");
    expect(preparation).toContain("hydrateNodeGenerationContext(");
    expect(preparation).toContain("readCanvasReferenceImages(");
    expect(retry).toContain("generateCanvasImage(generation,");
    expect(retry).toContain("resolveCanvasRetryImageMetadata(");
    expect(retry).toContain("saveResultImage(image.dataUrl");
    expect(feature).not.toContain('from "./image-retry-execution"');
    expect(manifest.exports["./canvas/image-retry-execution"]).toBeUndefined();
    expect(manifest.exports["./canvas/retry-plan"]).toBeUndefined();
    expect(manifest.exports["./canvas/retry-preparation"]).toBeUndefined();
});

test("canvas batch image execution returns per-item outcome without owning batch state", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const execution = readFileSync(resolve(sourceRoot, "features/canvas/batch-image-execution.ts"), "utf8");
    expect(editor).toContain("executeCanvasBatchImageAttempt({");
    expect(editor).toContain("Promise.all(");
    expect(editor).toContain("summarizeCanvasGenerationBatch(attempts)");
    expect(execution).toContain('status: "succeeded"');
    expect(execution).toContain('status: "failed"');
    expect(execution).toContain('status: "canceled"');
    expect(execution).not.toContain("setNodes(");
    expect(manifest.exports["./canvas/batch-image-execution"]).toBe("./src/features/canvas/batch-image-execution.ts");
});

test("canvas batch item result writes stay in the pure result feature", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const result = readFileSync(resolve(sourceRoot, "features/canvas/batch-image-result.ts"), "utf8");
    expect(editor).toContain("applyCanvasBatchImageAttemptResult");
    expect(editor).not.toContain("images: node.metadata?.images?.map((image) => (image.id === imageId");
    expect(result).toContain("applyCanvasBatchImageAttemptResult");
    expect(result).toContain('attempt.status === "canceled"');
});

test("canvas builtin image writeback uses a dedicated execution boundary", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const writeback = readFileSync(resolve(sourceRoot, "features/canvas/image-writeback-execution.ts"), "utf8");
    expect(editor).toContain("executeCanvasImageWriteback({");
    expect(editor).not.toContain("buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, fullPrompt)");
    expect(writeback).toContain("hydrateNodeGenerationContext(");
    expect(writeback).toContain("generateCanvasImage(generation,");
    expect(writeback).toContain("saveResultImage(image.dataUrl");
    expect(manifest.exports["./canvas/image-writeback-execution"]).toBe("./src/features/canvas/image-writeback-execution.ts");
});

test("canvas config readiness and settings prompting use the host capability hook", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const access = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-config-access.ts"), "utf8");
    expect(editor).toContain("useCanvasConfigAccess({ mode: hostMode, config: configAccess, notify: message.info }");
    expect(editor).not.toContain("hostMode !== \"mock\" && Boolean(configAccess?.isReady(model))");
    expect(access).toContain("mode === \"mock\"");
    expect(access).toContain("config.openSettings(shouldPromptContinue)");
    expect(access).toContain("config?.isReady(model)");
    expect(manifest.exports["./canvas/config-access"]).toBe("./src/features/canvas/use-canvas-config-access.ts");
});

test("canvas editor delegates coordinate conversion and video result mapping", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    expect(editor).toContain("screenPointToCanvas");
    expect(editor).toContain("applyCanvasVideoResult");
    expect(editor).not.toContain("function applyGeneratedVideo");
    expect(manifest.exports["./canvas/coordinates"]).toBe("./src/features/canvas/coordinates.ts");
    expect(manifest.exports["./canvas/video-result"]).toBe("./src/features/canvas/video-result.ts");
    expect(editor).toContain("findCanvasConnectionDropTarget");
    expect(editor).toContain("getVisibleCanvasNodes");
    expect(editor).toContain('from "./use-canvas-selection-gesture"');
    expect(editor).not.toContain("resolveCanvasSelectionMove");
    expect(manifest.exports["./canvas/viewport-geometry"]).toBe("./src/features/canvas/viewport-geometry.ts");
});

test("group actions own grouping behavior while geometry remains a compatibility facade", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const drag = readFileSync(resolve(sourceRoot, "features/canvas/node-drag.ts"), "utf8");
    const geometry = readFileSync(resolve(sourceRoot, "lib/canvas/canvas-node-geometry.ts"), "utf8");
    expect(editor).toContain('from "./group-actions"');
    expect(drag).toContain('from "./group-actions"');
    expect(geometry).toContain('from "../../features/canvas/group-actions"');
    expect(geometry).not.toContain("function applyGroupSelection");
    expect(geometry).not.toContain("function applyUngroupSelection");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain('from "./group-actions"');
    expect(manifest.exports["./canvas/group-actions"]).toBe("./src/features/canvas/group-actions.ts");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/connection-actions.ts"), "utf8")).toContain("normalizeCanvasConnection");
    expect(manifest.exports["./canvas/connection-actions"]).toBe("./src/features/canvas/connection-actions.ts");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/viewport-geometry.ts"), "utf8")).toContain("getCanvasConnectionTargetAnchor");
    expect(readFileSync(resolve(sourceRoot, "components/canvas/canvas-selection-toolbar.tsx"), "utf8")).toContain('from "../../features/canvas/selection-geometry"');
    expect(geometry).toContain('from "../../features/canvas/selection-geometry"');
    expect(geometry).not.toContain("function nodeBounds");
    expect(manifest.exports["./canvas/selection-geometry"]).toBe("./src/features/canvas/selection-geometry.ts");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8")).toContain('from "./selection-geometry"');
    expect(readFileSync(resolve(sourceRoot, "features/canvas/selection-geometry.ts"), "utf8")).toContain("selectCanvasNodesInBox");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8")).toContain('from "./selection-gesture"');
    expect(readFileSync(resolve(sourceRoot, "features/canvas/selection-gesture.ts"), "utf8")).toContain("resolveCanvasSelectionMove");
    expect(manifest.exports["./canvas/selection-gesture"]).toBe("./src/features/canvas/selection-gesture.ts");
    const selectionHook = readFileSync(resolve(sourceRoot, "features/canvas/use-canvas-selection-gesture.ts"), "utf8");
    expect(selectionHook).toContain("resolveCanvasSelectionMove");
    expect(selectionHook).toContain("nodesRef.current");
    expect(selectionHook).not.toContain("getNodes");
    expect(selectionHook).not.toContain("connectNodes");
    expect(manifest.exports["./canvas/selection-gesture-hook"]).toBe("./src/features/canvas/use-canvas-selection-gesture.ts");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain("useCanvasSelectionGesture");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain("CanvasSelectionGestureOptions");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/node-drag.ts"), "utf8")).toContain("resolveCanvasNodeDragEnd");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/node-drag.ts"), "utf8")).toContain("createCanvasNodeDragState");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/node-drag.ts"), "utf8")).toContain("resolveCanvasNodeDragPreview");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/node-drag.ts"), "utf8")).toContain("resetCanvasNodeDragState");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain("useCanvasNodeDragGesture");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain("CanvasNodeDragGestureOptions");
    expect(manifest.exports["./canvas/node-drag-hook"]).toBe("./src/features/canvas/use-canvas-node-drag-gesture.ts");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain("CanvasNodeDragState");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/node-drag.ts"), "utf8")).toContain("resolveCanvasNodeDragMove");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/connection-gesture.ts"), "utf8")).toContain("resolveCanvasConnectionHover");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain("useCanvasConnectionGesture");
    expect(manifest.exports["./canvas/connection-gesture-hook"]).toBe("./src/features/canvas/use-canvas-connection-gesture.ts");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain("useCanvasViewportGesture");
    expect(manifest.exports["./canvas/viewport-gesture-hook"]).toBe("./src/features/canvas/use-canvas-viewport-gesture.ts");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain("useCanvasViewportCommands");
    expect(manifest.exports["./canvas/viewport-commands-hook"]).toBe("./src/features/canvas/use-canvas-viewport-commands.ts");
    expect(readFileSync(resolve(sourceRoot, "features/canvas/index.ts"), "utf8")).toContain("useCanvasProjectInteractionReset");
    expect(manifest.exports["./canvas/project-interaction-reset-hook"]).toBe("./src/features/canvas/use-canvas-project-interaction-reset.ts");
});

test("canvas asset library stays independent of web workspace stores", () => {
    const source = readFileSync(resolve(sourceRoot, "features/canvas/asset-library.ts"), "utf8");
    expect(source).not.toContain("use-asset-store");
    expect(source).not.toContain("use-workspace-store");
    expect(source).not.toContain("workspace-to-insert");
});

test("workspace state and persistence belong to the web host", () => {
    const webRoot = resolve(packageRoot, "../../web/src");
    const webWorkspaceStore = readFileSync(resolve(webRoot, "stores/use-workspace-store.ts"), "utf8");
    const localRuntime = readFileSync(resolve(webRoot, "services/api/canvas/local-runtime.ts"), "utf8");
    expect(manifest.exports["./stores/workspace"]).toBeUndefined();
    expect(manifest.exports["./workspace-persistence"]).toBeUndefined();
    expect(manifest.exports["./integrations/workspace/folder"]).toBeUndefined();
    expect(manifest.exports["./integrations/workspace/item-sort"]).toBeUndefined();
    expect(manifest.exports["./integrations/workspace/assets"]).toBeUndefined();
    expect(webWorkspaceStore).toContain("@/services/workspace-persistence");
    expect(localRuntime).toContain("@/services/workspace-persistence");
});

test("browser localForage storage belongs to the web host", () => {
    const webStorage = readFileSync(resolve(packageRoot, "../../web/src/lib/localforage-storage.ts"), "utf8");
    const localAdapters = ["local-asset-store.ts", "local-canvas-store.ts", "local-plugin-store.ts", "local-workspace-persistence.ts"]
        .map((name) => readFileSync(resolve(packageRoot, `../../web/src/services/api/canvas/${name}`), "utf8"));
    expect(webStorage).toContain("localforage.config");
    expect(webStorage).toContain("export const localForageStorage");
    expect(localAdapters.every((source) => source.includes("@/lib/localforage-storage"))).toBe(true);
    expect(localAdapters.some((source) => source.includes("@infinite-canvas/core/local/storage"))).toBe(false);
});

test("browser media storage belongs to the web host", () => {
    const imageStorage = readFileSync(resolve(packageRoot, "../../web/src/services/image-storage.ts"), "utf8");
    const fileStorage = readFileSync(resolve(packageRoot, "../../web/src/services/file-storage.ts"), "utf8");
    const adapters = ["local-asset-store.ts", "local-project-asset-storage.ts", "local-workspace-persistence.ts"]
        .map((name) => readFileSync(resolve(packageRoot, `../../web/src/services/api/canvas/${name}`), "utf8"));
    expect(imageStorage).toContain('createLocalForageStore("image_files")');
    expect(fileStorage).toContain('createLocalForageStore("media_files")');
    expect(adapters.every((source) => source.includes("@/services/image-storage") || source.includes("@/services/file-storage"))).toBe(true);
    expect(adapters.some((source) => source.includes("@infinite-canvas/core/local/image-storage") || source.includes("@infinite-canvas/core/local/file-storage"))).toBe(false);
});

test("browser project asset catalog belongs to the web host", () => {
    const catalog = readFileSync(resolve(packageRoot, "../../web/src/services/api/canvas/local-catalog.ts"), "utf8");
    expect(catalog).toContain("createCanvasProjectAssetCatalog");
    expect(catalog).toContain('createLocalForageStore("canvas_project_assets")');
    expect(manifest.exports["./local-project-asset-catalog"]).toBeUndefined();
});

test("prompt library is an optional host integration", () => {
    const sidePanel = readFileSync(resolve(sourceRoot, "components/canvas/canvas-side-panel.tsx"), "utf8");
    const host = readFileSync(resolve(sourceRoot, "features/canvas/canvas-host.tsx"), "utf8");
    const webRoot = resolve(packageRoot, "../../web/src");
    const webProject = readFileSync(resolve(webRoot, "pages/canvas/project.tsx"), "utf8");
    const webPromptLibrary = readFileSync(resolve(webRoot, "components/canvas/canvas-prompt-library.tsx"), "utf8");
    const demo = readFileSync(resolve(packageRoot, "../../apps/canvas-demo/src/workbench.tsx"), "utf8");

    expect(sidePanel).toContain("renderPromptLibrary");
    expect(sidePanel).not.toContain("usePromptSourceStore");
    expect(sidePanel).not.toContain("services/api/prompts");
    expect(sidePanel).not.toContain("PromptDetailDialog");
    expect(host).toContain("renderPromptLibrary?:");
    expect(host).toContain("renderPromptSelector?:");
    const promptPanel = readFileSync(resolve(sourceRoot, "components/canvas/canvas-node-prompt-panel.tsx"), "utf8");
    expect(promptPanel).toContain("renderPromptSelector({ open: promptSelectorOpen");
    expect(promptPanel).toContain("setPromptSelectorOpen(true)");
    expect(webProject).toContain("renderPromptLibrary,");
    expect(webPromptLibrary).toContain("usePromptSourceStore");
    expect(webPromptLibrary).toContain("fetchSourcePrompts");
    expect(demo).not.toContain("renderPromptLibrary");
    expect(demo).not.toContain("renderPromptSelector");
    for (const name of ["integrations/prompts/card", "integrations/prompts/select-dialog", "integrations/prompts/use-list", "integrations/prompts/detail-dialog", "integrations/prompts/source-presets", "integrations/prompts/source-runtime", "integrations/prompts/api", "stores/prompt-source"]) {
        expect(manifest.exports[`./${name}`]).toBeUndefined();
    }
});

test("canvas video result reads use the host media adapter", () => {
    const source = readFileSync(resolve(sourceRoot, "services/api/canvas/result-media.ts"), "utf8");
    expect(source).toContain("readCanvasReferenceMedia");
    expect(source).not.toContain("use-config-store");
});

test("video recovery UI shares task handle rules and never treats invalid handles as automatic work", () => {
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const taskPanel = readFileSync(resolve(sourceRoot, "components/canvas/canvas-task-status-panel.tsx"), "utf8");
    const toolbar = readFileSync(resolve(sourceRoot, "components/canvas/canvas-node-hover-toolbar.tsx"), "utf8");
    for (const [name, source] of [["editor", editor], ["task panel", taskPanel], ["node toolbar", toolbar]] as const) {
        expect(source, name).toContain("hasVideoTaskReference");
    }
    expect(editor).toContain("getResumableVideoTaskHandle(node)");
    expect(editor).toContain("if (hasVideoTaskReference(node))");
});

test("canvas task panel recognizes and displays unified task result identities", () => {
    const taskPanel = readFileSync(resolve(sourceRoot, "components/canvas/canvas-task-status-panel.tsx"), "utf8");
    expect(taskPanel).toContain("node.metadata?.taskId || node.metadata?.model");
    expect(taskPanel).toContain("taskId: {node.metadata.taskId}");
    expect(taskPanel).toContain("versionId: {node.metadata.versionId}");
    expect(taskPanel).toContain("assetId: {node.metadata.assetId}");
});

test("web generation adapters receive project presence from the host", () => {
    for (const name of ["image-generation.ts", "audio-generation.ts", "video-generation.ts"]) {
        const source = readFileSync(resolve(packageRoot, `../../web/src/services/api/canvas/${name}`), "utf8");
        expect(source, name).not.toContain("useCanvasStore");
        expect(source, name).toContain("isProjectOpen: CanvasProjectPresence");
    }
});

test("web canvas video host imports resolved execution from the provider boundary", () => {
    const source = readFileSync(resolve(packageRoot, "../../web/src/services/api/canvas/video-generation.ts"), "utf8");
    expect(source).toContain("@infinite-canvas/core/provider/video-execution");
    expect(source).toContain("@infinite-canvas/core/video-task");
    expect(source).not.toContain("@infinite-canvas/core/video-provider");
    const execution = readFileSync(resolve(sourceRoot, "services/api/video-execution.ts"), "utf8");
    expect(execution).toContain("createResolvedVideoGenerationTask");
    expect(execution).toContain("waitForResolvedVideoGenerationTask");
    const executor = readFileSync(resolve(sourceRoot, "services/api/video.ts"), "utf8");
    const workbench = readFileSync(resolve(sourceRoot, "services/api/video-workbench.ts"), "utf8");
    expect(executor).not.toContain("use-config-store");
    expect(executor).not.toContain("provider-media-persistence");
    expect(workbench).toContain("resolveModelRequestConfig");
    expect(workbench).toContain("readProviderMedia");
});

test("generated audio and video persistence belongs to the web host", () => {
    const coreAudio = readFileSync(resolve(sourceRoot, "services/api/audio.ts"), "utf8");
    const coreVideo = readFileSync(resolve(sourceRoot, "services/api/video.ts"), "utf8");
    const webAudio = readFileSync(resolve(packageRoot, "../../web/src/services/api/audio.ts"), "utf8");
    const webVideo = readFileSync(resolve(packageRoot, "../../web/src/services/api/video.ts"), "utf8");
    expect(coreAudio).not.toContain("getProviderMediaPersistence");
    expect(coreVideo).not.toContain("uploadMedia(");
    expect(webAudio).toContain("storeGeneratedAudio");
    expect(webVideo).toContain("storeGeneratedVideo");
});

test("leaf Provider executors depend on the standalone request contract", () => {
    for (const filename of ["services/api/grok-image.ts", "services/api/grok-video.ts", "services/api/specialized-video.ts", "services/api/model-plugin.ts"]) {
        const source = ts.createSourceFile(filename, readFileSync(resolve(sourceRoot, filename), "utf8"), ts.ScriptTarget.Latest, true);
        const storeImports = source.statements.filter((statement): statement is ts.ImportDeclaration => ts.isImportDeclaration(statement) && statement.moduleSpecifier.getText(source).includes("use-config-store"));
        expect(storeImports, filename).toHaveLength(0);
        expect(readFileSync(resolve(sourceRoot, filename), "utf8"), filename).toContain("ProviderRequestConfig");
    }
    expect(manifest.exports["./provider/runtime"]).toBe("./src/lib/provider-runtime.ts");
    expect(manifest.exports["./provider/request"]).toBe("./src/types/provider-request.ts");
    const audioExecution = readFileSync(resolve(sourceRoot, "services/api/audio-execution.ts"), "utf8");
    expect(audioExecution).toContain("ProviderRequestConfig");
    expect(audioExecution).not.toContain("use-config-store");
    for (const filename of ["services/api/grok-video.ts", "services/api/specialized-video.ts"]) {
        const leaf = readFileSync(resolve(sourceRoot, filename), "utf8");
        expect(leaf, filename).not.toContain("provider-media-persistence");
        expect(leaf, filename).not.toContain("image-input");
    }
    expect(readFileSync(resolve(sourceRoot, "services/api/video-workbench.ts"), "utf8")).toContain("readProviderMedia");
    expect(manifest.exports["./provider/audio-execution"]).toBe("./src/services/api/audio-execution.ts");
    const imageExecution = readFileSync(resolve(sourceRoot, "services/api/image-execution.ts"), "utf8");
    expect(imageExecution).toContain("ProviderRequestConfig");
    expect(imageExecution).not.toContain("use-config-store");
    expect(imageExecution).not.toContain("./image-input");
    const grokImageExecution = readFileSync(resolve(sourceRoot, "services/api/grok-image.ts"), "utf8");
    expect(grokImageExecution).not.toContain("./image-input");
    expect(imageExecution).not.toContain("requestGeneration(config:");
    expect(manifest.exports["./provider/image-execution"]).toBe("./src/services/api/image-execution.ts");
});

test("resolved video executor reads images only through the host reader", () => {
    const executor = readFileSync(resolve(sourceRoot, "services/api/video.ts"), "utf8");
    const workbench = readFileSync(resolve(sourceRoot, "services/api/video-workbench.ts"), "utf8");
    expect(executor).toContain('from "./image-read"');
    expect(executor).not.toContain('from "./image-input"');
    expect(executor).not.toContain("provider-media-persistence");
    expect(workbench).toContain('from "./image-input"');
    expect(workbench).toContain("provider-media-persistence");
});

test("canvas video compatibility entry delegates through explicit provider boundaries", () => {
    const source = readFileSync(resolve(sourceRoot, "features/canvas/video-provider.ts"), "utf8");
    expect(source).toContain('from "../../services/api/video-execution"');
    expect(source).toContain('from "../../services/api/video-workbench"');
    expect(source).not.toContain('from "../../services/api/video"');
});

test("director desk integration is supplied by the host", () => {
    const host = readFileSync(resolve(sourceRoot, "features/canvas/canvas-host.tsx"), "utf8");
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const toolbar = readFileSync(resolve(sourceRoot, "components/canvas/canvas-toolbar.tsx"), "utf8");
    const webRoot = resolve(packageRoot, "../../web/src");
    const webHost = readFileSync(resolve(webRoot, "pages/canvas/project.tsx"), "utf8");
    const webIntegration = readFileSync(resolve(webRoot, "lib/director-desk.ts"), "utf8");
    const demo = readFileSync(resolve(packageRoot, "../../apps/canvas-demo/src/workbench.tsx"), "utf8");
    expect(host).toContain("CanvasDirectorDesk");
    expect(editor).toContain("directorDesk.subscribeCaptures");
    expect(editor).not.toContain("DIRECTOR_DESK_CAPTURES_EVENT");
    expect(editor).not.toContain("requestOpenDirectorDesk");
    expect(toolbar).not.toContain("isDirectorDeskEnabled");
    expect(toolbar).toContain("directorDeskEnabled && onOpenDirectorDesk");
    expect(webHost).toContain("DIRECTOR_DESK_CAPTURES_EVENT");
    expect(webHost).toContain("directorDesk,");
    expect(webIntegration).toContain("DIRECTOR_DESK_CAPTURES_EVENT");
    expect(manifest.exports["./integrations/workspace/director-desk"]).toBeUndefined();
    expect(demo).not.toContain("directorDesk:");
});

test("canvas Agent bridge receives its store setter from the host", () => {
    const bridge = readFileSync(resolve(sourceRoot, "features/canvas/use-agent-bridge.ts"), "utf8");
    const host = readFileSync(resolve(sourceRoot, "features/canvas/canvas-host.tsx"), "utf8");
    const webHost = readFileSync(resolve(packageRoot, "../../web/src/pages/canvas/project.tsx"), "utf8");
    expect(bridge).not.toContain("useAgentStore");
    expect(bridge).not.toContain("../../../i18n");
    expect(host).toContain("agentBridge?: CanvasAgentBridge");
    expect(webHost).toContain("setCanvasContext: (context) => useAgentStore.getState().setCanvasContext(context)");
});

test("canvas plugin image execution requires the host generation port", () => {
    const source = readFileSync(resolve(sourceRoot, "services/api/canvas/plugin-image.ts"), "utf8");
    expect(source).toContain("generation: CanvasPluginImageGeneration");
    expect(source).not.toContain("AiConfig");
    expect(source).not.toContain("requestGeneration");
    expect(source).not.toContain("requestCanvasImageEdit");
});

test("plugin lifecycle is an optional host capability", () => {
    const host = readFileSync(resolve(sourceRoot, "features/canvas/canvas-host.tsx"), "utf8");
    const pluginHook = readFileSync(resolve(sourceRoot, "features/canvas/use-plugin-host.tsx"), "utf8");
    const pluginModal = readFileSync(resolve(sourceRoot, "components/canvas/canvas-plugin-manager-modal.tsx"), "utf8");
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const webHost = readFileSync(resolve(packageRoot, "../../web/src/pages/canvas/project.tsx"), "utf8");
    const webAdapter = readFileSync(resolve(packageRoot, "../../web/src/services/api/canvas/local-plugin-manager.ts"), "utf8");
    const demo = readFileSync(resolve(packageRoot, "../../apps/canvas-demo/src/workbench.tsx"), "utf8");
    expect(host).toContain("pluginManager?: CanvasPluginManager");
    expect(pluginHook).toContain("if (!enabled || !pluginManager) return");
    expect(pluginHook).not.toContain('from "../../lib/canvas/plugin-loader"');
    expect(pluginModal).toContain("useSyncExternalStore");
    expect(pluginModal).toContain("pluginManager: CanvasPluginManager");
    expect(pluginModal).not.toContain("usePluginStore");
    expect(pluginModal).not.toContain("useCanvasHost");
    expect(pluginModal).not.toContain("pluginManager!");
    expect(pluginModal).not.toContain("plugin-loader");
    expect(pluginModal).not.toContain("plugin-registry");
    expect(editor).toContain("pluginManager ? <CanvasPluginManagerModal");
    expect(webHost).toContain("pluginManager: localCanvasPluginManager");
    expect(webAdapter).toContain("ensurePluginsLoaded");
    expect(webAdapter).toContain("source: _source");
    expect(demo).not.toContain("pluginManager:");
});

test("canvas UI reads and changes theme only through the host capability", () => {
    const componentsRoot = resolve(sourceRoot, "components/canvas");
    const violations: string[] = [];
    for (const entry of readdirSync(componentsRoot, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
        const filename = resolve(entry.parentPath, entry.name);
        if (readFileSync(filename, "utf8").includes("useThemeStore")) violations.push(filename);
    }
    const editor = readFileSync(resolve(sourceRoot, "features/canvas/canvas-editor.tsx"), "utf8");
    const host = readFileSync(resolve(sourceRoot, "features/canvas/canvas-host.tsx"), "utf8");
    expect(editor).not.toContain("useThemeStore");
    expect(host).toContain("colorTheme: CanvasColorTheme");
    expect(host).toContain("setColorTheme: (theme: CanvasColorTheme) => void");
    expect(violations).toEqual([]);
});

test("canvas preferences use a credential-free host source contract", () => {
    const source = readFileSync(resolve(sourceRoot, "features/canvas/generation-preferences.ts"), "utf8");
    const adapter = readFileSync(resolve(packageRoot, "../../web/src/services/api/canvas/generation-preferences.ts"), "utf8");
    expect(source).toContain("CanvasGenerationPreferenceSource");
    expect(adapter).toContain("config: CanvasGenerationPreferenceSource");
    expect(adapter).not.toContain("canvasGenerationPreferences(config: AiConfig)");
});

test("web canvas wrappers use named package subpaths instead of internal paths", () => {
    const webRoot = resolve(packageRoot, "../../web/src");
    const violations: string[] = [];
    for (const entry of readdirSync(webRoot, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
        const filename = resolve(entry.parentPath, entry.name);
        if (readFileSync(filename, "utf8").includes("@infinite-canvas/core/internal/")) violations.push(filename);
    }
    const wrapperRoots = ["components/canvas", "lib/canvas", "types", "features/canvas"];
    for (const root of wrapperRoots) {
        for (const entry of readdirSync(resolve(webRoot, root), { recursive: true, withFileTypes: true })) {
            if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
            const filename = resolve(entry.parentPath, entry.name);
            const source = readFileSync(filename, "utf8");
            if (source.includes("@infinite-canvas/core/internal/")) violations.push(filename);
        }
    }
    for (const name of ["use-asset-store.ts", "use-config-store.ts", "use-theme-store.ts", "use-workspace-store.ts", "use-canvas-side-panel-store.ts", "use-agent-store.ts", "use-prompt-source-store.ts", "canvas/use-canvas-store.ts", "canvas/use-plugin-store.ts"]) {
        const source = readFileSync(resolve(webRoot, "stores", name), "utf8");
        if (source.includes("@infinite-canvas/core/internal/")) violations.push(name);
    }
    const videoGeneration = readFileSync(resolve(webRoot, "services/api/canvas/video-generation.ts"), "utf8");
    if (videoGeneration.includes("@infinite-canvas/core/internal/")) violations.push("services/api/canvas/video-generation.ts");
    for (const name of ["api/video.ts", "api/video/types.ts"]) {
        const source = readFileSync(resolve(webRoot, "services", name), "utf8");
        if (source.includes("@infinite-canvas/core/internal/")) violations.push(`services/${name}`);
    }
    for (const name of ["api/audio.ts", "api/image.ts", "api/grok-image.ts", "api/grok-video.ts", "api/specialized-video.ts", "api/model-plugin.ts"]) {
        const source = readFileSync(resolve(webRoot, "services", name), "utf8");
        if (source.includes("@infinite-canvas/core/internal/")) violations.push(`services/${name}`);
    }
    for (const [name, exportPath] of Object.entries({
        "agnes-video.ts": "provider/agnes-video",
        "audio-host-profile.ts": "provider/audio-host-profile",
        "audio-generation.ts": "provider/audio-generation",
        "channel-compat.ts": "provider/channel-compat",
        "grok-video.ts": "provider/grok-video-profile",
        "grok-model-profile.ts": "provider/grok-model-profile",
        "kling-video.ts": "provider/kling-video",
        "seedance-video.ts": "provider/seedance-video",
    })) {
        const source = readFileSync(resolve(webRoot, "lib", name), "utf8");
        if (!source.includes(`@infinite-canvas/core/${exportPath}`)) violations.push(`lib/${name}`);
    }
    for (const [name, exportPath] of Object.entries({
        "audio-settings-panel.tsx": "host/settings/audio",
        "image-settings-panel.tsx": "host/settings/image",
        "text-settings-panel.tsx": "host/settings/text",
        "video-settings-panel.tsx": "host/settings/video",
    })) {
        const source = readFileSync(resolve(webRoot, "components", name), "utf8");
        if (!source.includes(`@infinite-canvas/core/${exportPath}`)) violations.push(`components/${name}`);
    }
    const archive = readFileSync(resolve(webRoot, "lib/zip.ts"), "utf8");
    if (!archive.includes("@infinite-canvas/core/canvas/archive")) violations.push("lib/zip.ts");
    for (const name of ["constant/canvas.ts", "lib/canvas-theme.ts", "lib/app-theme.ts", "lib/localforage-storage.ts", "lib/image-utils.ts", "lib/utils.ts", "lib/media-size.ts", "lib/keyboard-event.ts", "lib/image-reference-prompt.ts", "hooks/use-copy-text.ts"]) {
        const source = readFileSync(resolve(webRoot, name), "utf8");
        if (source.includes("@infinite-canvas/core/internal/")) violations.push(name);
    }
    for (const name of ["pages/canvas/hooks/use-agent-bridge.ts", "pages/canvas/hooks/use-plugin-host.tsx", "i18n/index.ts", "i18n/locales/en-US.ts", "i18n/locales/zh-CN.ts", "services/image-storage.ts", "services/file-storage.ts"]) {
        const source = readFileSync(resolve(webRoot, name), "utf8");
        if (source.includes("@infinite-canvas/core/internal/")) violations.push(name);
    }
    for (const name of ["local-asset-store.ts", "local-canvas-store.ts", "local-cleanup.ts", "local-plugin-store.ts", "local-project-asset-storage.ts", "local-workspace-persistence.ts"]) {
        const source = readFileSync(resolve(webRoot, "services/api/canvas", name), "utf8");
        if (source.includes("@infinite-canvas/core/internal/")) violations.push(name);
    }
    expect(violations).toEqual([]);
});

test("legacy model picker belongs to the web host", () => {
    const webRoot = resolve(packageRoot, "../../web/src");
    const modelPicker = readFileSync(resolve(webRoot, "components/model-picker.tsx"), "utf8");
    expect(modelPicker).toContain("use-config-store");
    expect(manifest.exports["./host/settings/model-picker"]).toBeUndefined();
    expect(readFileSync(resolve(sourceRoot, "components/canvas/canvas-model-picker.tsx"), "utf8")).not.toContain("use-config-store");
});

test("canvas demo consumes the package through public workspace exports", () => {
    const demoRoot = resolve(packageRoot, "../../apps/canvas-demo/src");
    const violations: string[] = [];
    for (const entry of readdirSync(demoRoot, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
        const filename = resolve(entry.parentPath, entry.name);
        if (readFileSync(filename, "utf8").includes("packages/canvas/src/")) violations.push(filename);
    }
    expect(violations).toEqual([]);
});

test("canvas task records use the shared host contract and status panel", () => {
    const host = readFileSync(resolve(sourceRoot, "features/canvas/canvas-host.tsx"), "utf8");
    const panel = readFileSync(resolve(sourceRoot, "components/canvas/canvas-task-status-panel.tsx"), "utf8");
    const sidePanel = readFileSync(resolve(sourceRoot, "components/canvas/canvas-side-panel.tsx"), "utf8");
    const demo = readFileSync(resolve(packageRoot, "../../apps/canvas-demo/src/workbench.tsx"), "utf8");
    expect(host).toContain("taskRecords?: CanvasHostTaskRecord[]");
    expect(panel).toContain("taskRecords = []");
    expect(panel).toContain("nodeTaskIds.has(record.task.taskId)");
    expect(sidePanel).toContain("record.task.projectId === projectId");
    expect(sidePanel).toContain("taskRecords={projectTaskRecords}");
    expect(demo).toContain("<CanvasTaskStatusPanel nodes={[]} taskRecords={taskRecords} />");
    expect(demo).not.toContain("function taskTag(");
});

test("web local host configures every persistence boundary before mounting React", () => {
    const webRoot = resolve(packageRoot, "../../web/src");
    const entry = readFileSync(resolve(webRoot, "main.tsx"), "utf8");
    const runtime = readFileSync(resolve(webRoot, "services/api/canvas/local-runtime.ts"), "utf8");
    expect(entry.indexOf("configureLocalCanvasRuntime();")).toBeLessThan(entry.indexOf("createRoot("));
    for (const configure of ["configureAssetStorePersistence", "configureCanvasProjectAssetCatalog", "configureCanvasProjectAssetStorage", "configureCanvasStorePersistence", "configurePluginStorePersistence", "configureProviderMediaPersistence", "configureAssetStoreCleanup"]) {
        expect(runtime).toContain(configure);
    }
});

test("canvas demo configures memory hosts independently from web local adapters", () => {
    const demoMain = readFileSync(resolve(packageRoot, "../../apps/canvas-demo/src/main.tsx"), "utf8");
    expect(demoMain).toContain("configureAssetStorePersistence(mockAssetStorePersistence)");
    expect(demoMain).toContain("configureCanvasStorePersistence(mockCanvasStorePersistence)");
    expect(demoMain).toContain("configurePluginStorePersistence(mockPluginStorePersistence)");
    expect(demoMain).not.toContain("localCanvas");
    expect(demoMain.indexOf("configureProviderMediaPersistence(")).toBeLessThan(demoMain.indexOf("createRoot("));
});

test("package exposes explicit integration subpaths without a wildcard internal export", () => {
    expect(manifest.exports["./internal/*"]).toBeUndefined();
    expect(manifest.exports["./integrations/runtime/env"]).toBeUndefined();
    expect(manifest.exports["./integrations/runtime/config"]).toBeUndefined();
    expect(manifest.exports["./project-host"]).toBe("./src/features/canvas/project-host.ts");
});

test("runtime configuration belongs to the web host while canvas keeps its plugin and docs defaults", () => {
    const webRoot = resolve(packageRoot, "../../web/src");
    const webRuntime = readFileSync(resolve(webRoot, "constant/runtime-config.ts"), "utf8");
    const webEnv = readFileSync(resolve(webRoot, "constant/env.ts"), "utf8");
    const canvasEnv = readFileSync(resolve(sourceRoot, "constant/env.ts"), "utf8");
    expect(webRuntime).toContain("ANALYTICS_GA4_ID");
    expect(webRuntime).toContain("CLOUD_API_BASE_URL");
    expect(webRuntime).toContain("CANVAS_API_BASE_URL");
    expect(webEnv).toContain('from "./runtime-config"');
    expect(canvasEnv).toContain("DOCS_URL");
    expect(canvasEnv).toContain("PLUGIN_REGISTRY_URL");
    expect(canvasEnv).not.toContain("CLOUD_API_BASE_URL");
});

test("canvas source entry includes package-level Vite and build constant declarations", () => {
    const env = readFileSync(resolve(sourceRoot, "constant/env.ts"), "utf8");
    expect(env).toContain("declare const __APP_VERSION__: string | undefined;");
    expect(env).toContain("import.meta.env.VITE_DOC_URL");
});
