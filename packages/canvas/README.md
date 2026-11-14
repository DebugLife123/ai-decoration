# Infinite Canvas React 模块

当前仓库内的私有源码包 `@infinite-canvas/core`，提供唯一的 `CanvasEditor`、节点组件、画布状态与工具、宿主上下文、前端契约和 Mock adapter。现有 `web` 与独立演示壳共用此实现，没有另建 Git 仓库。

## 开发与验证

在仓库根目录执行，依赖安装不要求先安装 `web`：

```sh
npm install
npm run test:canvas
npm run typecheck:canvas
npm run build:canvas
npm run dev:canvas
```

演示默认地址为 http://localhost:3100/。切换端口：`npm run dev --workspace @infinite-canvas/demo -- --port 3101 --strictPort`。

## React 集成

宿主声明本地依赖 `"@infinite-canvas/core": "file:../../packages/canvas"`（路径按宿主目录调整）。使用 Vite/TypeScript 消费源码，导入 `@infinite-canvas/core/styles.css` 并通过 Tailwind 4 PostCSS 编译；宿主自身的 Tailwind 类需显式配置 `@source`。Vite 应 dedupe React、ReactDOM、antd、Zustand、i18next、react-i18next 和 React Query，避免 workspace 链接产生多份运行时。

```tsx
import { CanvasEditor, CanvasHostContext, type CanvasHost } from "@infinite-canvas/core";

// host 注入 projectId、项目 store、导航、查询参数、运行模式、importImage、media、assetLibrary、可选 importVideo/importAudio/assetManager 及素材命令。
function DesignCanvas({ host }: { host: CanvasHost }) {
    return (
        <CanvasHostContext value={host}>
            <CanvasEditor key={host.projectId} />
        </CanvasHostContext>
    );
}
```

## CanvasApi 接入契约

`CanvasApi` 是宿主和编辑器之间的唯一项目数据边界。宿主需要提供项目、画布文档、素材、任务和版本的统一身份字段；编辑器不会读取宿主的业务聚合对象，也不会自行拼接业务 API。字段清单见 `docs/host-integration.md`。

标准任务 DTO 使用以下状态和身份关系：

```json
{
  "taskId": "task-1",
  "projectId": "project-1",
  "type": "EDIT",
  "status": "SUCCEEDED",
  "sourceAssetId": "asset-source",
  "sourceVersionId": "version-1",
  "resultAssetId": "asset-result",
  "versionId": "version-2",
  "error": null
}
```

主项目如果使用 `{ code, message, data, timestamp }` 包装响应，可直接创建 `createCanvasHttpAdapter({ responseEnvelope: "data" })`；如果项目接口返回的是聚合 JSON、历史字段或不同任务状态，应在宿主实现 `CanvasApi` 映射后再传给 `createApiCanvasHostAdapters`。不要把 `id`/`taskType`/`completed` 等业务字段扩展进通用契约。

宿主至少需要保证：项目和素材按 `projectId` 隔离；成功任务同时返回 `resultAssetId` 与 `versionId`；失败任务不返回结果身份；保存版本不会覆盖源版本；媒体 URL 或 `readAssetContent` 在刷新后仍可读取。`responseEnvelope: "data"` 只负责解包响应，不负责字段转换、权限判断、任务轮询或文件上传策略。

外层需要 antd `ConfigProvider`/`App`、React Query `QueryClientProvider` 和 i18n 初始化；参考 `apps/canvas-demo/src/main.tsx`，不需要 web 的账户或云端初始化。宿主可用 `renderUserActions` 注入账户等操作；React Router 仅在宿主使用，不是画布包依赖。容器需有确定的高度。

## 接入成熟度

当前可以作为仓库内源码包接入另一个 React 19 + Vite/TypeScript 宿主：使用本地 `file:` 依赖，提供 `CanvasHostContext` 所需的项目、版本、素材、媒体恢复/读取和上传能力，并按需注入图片/音频/视频生成、Agent、插件及提示词能力。宿主若不注入真实生成能力，画布仍可挂载，但不会因此获得真实模型执行。`apps/canvas-demo` 是同一编辑器的 Mock consumer，可参考其装配方式。

这还不是可直接从 npm 安装的通用 SDK：包目前为 `private`，exports 指向 TS/TSX 源码，consumer 需要能够编译该源码并满足列出的 peer dependencies、Tailwind 与 Provider 配置；目前没有声明发布产物、版本兼容策略或跨框架支持。若目标是独立于本仓库发布/安装，还需单独完成构建产物出口、外部 consumer 安装验证与发布流程。

“可嵌入”也不等于 CAN-01～CAN-05 全部产品验收完成。`canvas-module` 本身不包含 Spring Boot、PostgreSQL、对象存储、持久任务服务或服务端 Provider Adapter；这些能力由宿主项目提供，HTTP adapter 只定义标准 Canvas 路由和 DTO 边界。

公共入口：主入口导出编辑器与宿主类型；`/contracts` 导出项目/素材/任务/版本 DTO；`/mock` 导出 `createMockCanvasAdapter`；`/api-host-adapters` 导出 `createApiCanvasHostAdapters`，强制项目、素材、任务、结果、版本和媒体 adapter 由同一个 `CanvasApi` 实例装配；`/asset-import` 导出 `importCanvasImage` 和节点素材元数据映射；主入口还导出 `queryCanvasTask` 与参数显式的 `pollCanvasTask`，后者要求宿主传入间隔、等待函数、取消信号，可在不改变包默认行为的前提下接入自动轮询；`/http-adapter` 还导出可注入 transport 的 `createCanvasHttpBinaryUploader`，用于按 upload ticket 执行二进制 PUT。Mock adapter 返回隔离内存项目 store 与 API；素材通过 `assetCommand` 入画布。Mock 任务手动查询推进四态，成功创建新素材与版本，不调用模型，刷新清空数据。local web 可以只注入本地项目素材目录，不需要伪造远端 `assets/tasks` adapter。图片重试的 plan、上下文准备和执行器属于唯一 `CanvasEditor` 的内部编排，不作为宿主集成 API；接入方不要穿透 `src` 引用这些实现。

可选 `imageGeneration: CanvasImageGeneration` 从 `/image-generation` 导出：普通/批量图片生成、引用编辑、内置图片面板回填及失败重试每次调用 `execute(request, signal)` 获取单张 `{ dataUrl }`，批量编排仍由编辑器负责。请求仅含 projectId、显式 generate/edit、prompt、model/quality/size/background 和已读取的图片 id/name/type/dataUrl；共用分发器按白名单构建对象，不传 API Key、渠道、代理、systemPrompt 或本地 storageKey。web 的 `services/api/canvas/image-generation.ts` 捕获当前配置快照，沿用原 Provider、渠道/脚本选择和单张参数，项目移除或取消后不返回迟到成功，空结果明确失败。宿主页面 memoize adapter，配置变化才重建，进行中请求保留原快照。没有执行能力时不回退旧 Provider；Mock 不提供此能力，仍用独立模拟任务入口。本接口是旧同步结果的过渡端口，不是 submit/get task，也不返回 taskId、assetId 或 versionId；结果继续经宿主导入器保存，不自动创建版本。蒙版/角度、插件 Host API、音视频执行与配置就绪/界面仍待接入；旧 web 密钥依然在浏览器，本轮未完成服务端迁移。

宿主必须提供 `media: CanvasMediaAdapter`，类型及 `restoreCanvasMedia`、`readCanvasReferenceImages` 从 `/media` 导出。`restore(projectId, { nodes, chatSessions }, signal)` 负责项目和本地历史版本的媒体 URL 恢复；编辑器先克隆快照，避免宿主修改源项目/版本，再在异步完成后检查取消状态。web 注入 `localCanvasMedia`，沿用图片/备选图、视频、音频及旧助手引用的恢复逻辑和中断生成状态处理，不新增存储或数据迁移；Mock 注入 `adapter.media`，仅返回内存节点，旧助手会话仍为空，不读取/清理本地媒体。实现应保持 adapter 引用稳定，避免重复加载。

`media.readImage(projectId, reference, signal)` 必填，返回可供当前图片请求使用的 data URL；普通生成上下文、图片源节点、内置插件图片面板、蒙版/角度编辑、插件 Host API 图片/视频请求及保存元数据的失败重试通过此入口读取图片引用。共用读取器保持引用顺序、身份和源数据不变，空结果或抛错进入既有失败处理，无自动重试；取消后的结果不得提交生成。蒙版/角度及插件引用生图共用内部 `services/api/canvas/edit-image.ts`，读取完毕才提交旧 Provider，返回后再检查取消；保留原图/已保存标注图的顺序与元数据，取消不删除已保存素材。web 在读取前后检查项目存在性，由既有图片服务解析本地 key、Blob/data URL 或远程图片，继续使用原代理下载；保存元数据中的引用字符串对编辑器不透明解析，仅 web adapter 识别 `image:`。这是项目生命周期保护，不是素材归属鉴权。Mock 只接受内存 data URL，拒绝本地 key 和远程 URL，不读旧媒体库；不因此开放真实模型请求。画布把已读取的 data URL 通过内部 `readImage` 回调传给图片/视频 Provider，复用原 File/data URL 编码，不重复读取宿主或旧媒体库；注入读取失败不回退旧存储，读取前后检查取消。非画布工作台不传回调时仍用原图片服务，底层 Provider 尚未完全去存储依赖。

`media.readMedia(projectId, reference, signal)` 必填，返回音视频参考素材的 Blob；`CanvasMediaReference` 从 `/media` 导出，包含 name、可选 type/url/storageKey，后者仍是旧本地实现字段而非最终 HTTP DTO。编辑器视频生成与重试通过内部 `services/api/canvas/create-video-task.ts` 注入读取器；OpenAI、Gemini、脚本模型、Grok 编辑和 Seedance 保留既有能力校验、File/data URL 编码与顺序，不把临时 Blob 写入节点元数据。不支持的输入仍在读取前拒绝；读取失败不提交、不自动重试，取消后不发布迟到任务。web 使用既有文件服务和 URL 下载，异步读取前后检查项目和取消信号；这是生命周期保护，不是素材归属鉴权。Mock 明确拒绝音视频引用，不读取旧存储或访问网络；其他工作台不传读取器时仍走原服务。本接口尚非完整模型/任务 adapter，真实播放、编辑器错误提示和生命周期仍需浏览器验收。

`media.cleanup(extra)` 由宿主负责清理：web 继续委托既有全局引用保护，保留项目目录、节点、版本、全局素材及撤销历史引用；Mock 无操作。项目恢复抛错时显示手动重新加载入口，加载成功前不自动保存空画布；无自动重试。切项目/卸载或重复恢复版本时，取消旧恢复的回填，不承诺中止已开始的本地存储 I/O，也不回滚既有 data URL 入库操作。此接口是媒体恢复、输入引用读取和清理边界，不是完整版本/任务 API。

宿主必须提供 `importImage(projectId, file)`，返回带 `assetId`、`projectId`、尺寸、URL 和字节数的图片素材。Mock 可委托 `importCanvasImage(adapter.api, projectId, file)`，读取并验证图片后调用 `uploadAsset`；原 web 的 `web/src/services/api/canvas/local-adapter.ts` 使用本地图片存储与 localforage 项目目录，按 projectId 列举并重建预览 URL，失败回滚目录和文件。工具栏、图片替换、拖入、剪贴板导入、裁剪、蒙版标注图、放大及切图保存共用此边界；替换会清除节点旧任务/版本标记，重新选择原版本仍可插入独立节点。`storageKey` 仅属于旧本地存储实现，不是未来 HTTP DTO。

裁剪复用现有弹窗与像素处理，PNG 文件交给宿主导入器；成功后创建独立素材和等比例子节点，保留源节点及源版本，不继承旧 taskId/versionId。保存中防止重复确认，失败提示并保留弹窗，可手动重试；加载/编码失败不调用存储。切项目或卸载后不回填旧请求；源节点已移除时仅保留成功保存的项目素材，不创建悬空连线。Mock 仅写内存目录，原 web 复用本地目录的回滚/引用保护。裁剪尚不自动创建方案版本，不等同于统一编辑任务或完整版本合同。

蒙版复用现有涂抹/撤销/擦除和导出流程，以 `mask.png` 交给同一导入器，成功后才创建新标注节点、待编辑节点与连线，不覆盖源素材或源版本。保存中禁止重复提交和关闭，失败保留涂抹/提示词供手动重试；切项目/卸载忽略迟到回填，源节点移除后仅保留已保存素材。合成上下文或编码失败明确报错，不保存未标注原图。当前仍是原图叠加蓝色标注的参考图，并非独立二值蒙版；Mock 仅支持导出，不调用模型、不自动创建任务/版本。web 的后续真实模型请求仍沿用旧流程，图片结果保存已接宿主导入器；生成失败保留已保存标注图并标记结果节点错误，不承诺跨素材/生成事务。

放大和切图复用现有算法与同一弹窗，PNG 交给宿主导入器，创建新素材/节点，不覆盖源图、不继承源任务/版本，也不自动创建方案版本。既有放大 4096 上限与切图并发方式不变；不等宽切片按实际像素边界布局。切图部分成功时保留成功素材和节点，弹窗列出失败片，手动重试只保存失败项；首次保存后锁定切分参数，关闭会丢弃重试批次但不会删除已保存素材。保存中防重复/关闭，失败留窗；切项目或卸载后忽略迟到回填，源节点移除后仅保留已保存素材。Mock 共用这些工具，刷新清空内存目录。

可选 `importVideo(projectId, file)` 返回 `CanvasImportedVideo`，供工具栏上传、替换、拖入及生成/查询结果保存共用；未提供时报告不支持，并在生成请求前拒绝，不回退到编辑器直接存储。原 web 先读取浏览器视频元数据，损坏或尺寸无效时不入库；成功后写入同一项目目录及既有本地媒体库，保存尺寸、时长和 storageKey，不持久化临时 URL。项目图片/视频目录参与统一清理与失败回滚，视频替换不继承旧生成任务或版本标记。`CanvasProjectAsset` 仅扩展素材选择边界，图片 `CanvasApi` 和 Mock 生成/编辑任务仍只接图片；Mock demo 不提供视频导入。

可选 `importAudio(projectId, file)` 返回 `CanvasImportedAudio`，包含素材身份、URL、字节数和可用时长，不包含图片宽高；未提供时提示不支持，并在生成请求前拒绝，不直接写入旧媒体库。原 web 在音频元数据读取成功后写入同一项目目录与本地媒体库，失败回滚，刷新重建 URL；上传、拖入、替换、生成及重试结果保存共用此入口，替换清除旧任务/版本与图片尺寸标记。仍沿用已有音频类型判断，不新增时长、大小或超时限制。Mock 不提供音视频导入，图片任务契约不变。

生成音视频的结果导入集中在 `services/api/canvas/result-media.ts`：视频 Blob 直接导入，URL 沿用既有代理下载，HTTP/网络/类型/保存失败明确报错，不把远程 URL 冒充已保存素材。缺失或通用 MIME 使用既有格式信息，显式非媒体类型拒绝；实际可解码性由宿主导入器校验。切项目/卸载后忽略迟到回填，不删除导入器已保存的素材；视频轮询复用请求登记避免重复。保存失败保留已有远端视频任务信息，重试查询原任务；音频和无可恢复任务 ID 的一次性/插件视频重试可能重新请求模型，不是仅重试本地保存。旧 `videoTaskId` 仍是 Provider 标识，不等于统一契约 `taskId`。这些操作不自动创建方案版本，其他工作台旧保存服务不变。

宿主还需提供 `assetLibrary`：`/asset-library` 导出 `CanvasAssetLibrary`（异步 `list`、可选 `subscribe`）和 `createProjectAssetLibrary(api, projectId)`。共用工具栏「选择资产」读取此来源；Mock 使用项目素材，保留 assetId 并避免重复插入、跨项目读取及旧媒体库写入。原 web 通过 `createLocalCanvasAssetLibrary(projectId)` 合并当前项目图片/视频/音频目录与 `web/src/services/api/canvas/asset-library.ts` 的全局「我的资产 / 工作区素材」，保留文本/图片/视频和筛选，不将全局素材伪装成项目 HTTP DTO。项目音视频重选沿用 assetId 定位已有节点，音频筛选仅在来源包含音频时显示；目录不生成音视频封面，插入后使用既有节点播放。旧全局素材管理不新增音频导入。

可选 `assetManager` 控制旧左侧「资产」管理页签；`/asset-manager` 导出 `CanvasAssetManager`（异步 `list/add/remove`、可选 `subscribe`）与 `CanvasManagedAsset`。列表返回 hydration/loading 状态、分类、标签、预览与插入 payload；宿主负责存储和移除清理，面板保留分类筛选、逐文件状态、失败单项重试，并处理列表加载失败、手动重试及迟到响应。原 web 注入「我的资产」本地 adapter；不改变工作区素材的管理流程。这里的目录 `id` 不是项目 `assetId`，不人为补 projectId。Mock 不提供该旧全局目录管理器，仍使用项目素材选择与上传。

插件 Host API 的 `generateImage` / `generateVideo` 经内部 `plugin-image.ts` / `plugin-video.ts` 编排，图片引用先交给宿主读取，再提交旧 Provider；无引用生图仍调用原生成接口。图片和视频共用项目/媒体 adapter/视频导入器/启用状态的取消作用域，调用方取消、切项目、禁用插件或卸载后阻止迟到成功结果返回，StrictMode effect setup 重新创建控制器；完整 Hook 生命周期仍待浏览器验收。图片结果也通过 `media.readImage` 物化，Provider 返回 id 不冒充已保存 assetId，未知 MIME 以空 type 表达；读取失败或空结果仍按原顺序返回原 URL，取消错误不回退成功。不自动导入图片或创建版本，不新增公开 adapter 方法。

`generateVideo` 也复用宿主 `importVideo`，不再直接调用旧视频保存服务；未提供导入能力时，在引用读取和模型请求前拒绝。下载/类型/保存失败向插件抛错，不会回滚宿主已经保存的素材。SDK 仍只返回 URL、MIME、尺寸和时长，不增加 assetId/storageKey，也不自动创建任务或方案版本。保存失败后插件再次调用可能重新请求模型，没有自动重试或结果缓存。项目目录可列举和重选已保存视频，但插件自定义节点的 URL 刷新恢复身份尚未解决。

## 当前边界

- 普通/批量生图、蒙版/角度结果、内置插件图片回填、重试、既有助手图片插入和视频首/当前/尾帧保存已共用宿主 `importImage`。URL 结果沿用既有下载/代理机制，必须可读取图片字节，不以远程 URL 或假尺寸伪装已保存素材；备选图携带 assetId。切项目/卸载中止图片回填，取消不删除导入器已保存的素材；这些操作不自动创建方案版本。生成音视频及插件 Host API 视频保存、项目/历史版本媒体恢复、编辑器触发的清理、编辑器/插件图片引用、视频生成音视频输入读取及插件图片结果物化已接宿主，画布图片字节在 Provider 内复用；非画布 Provider 默认读取、插件自定义节点媒体身份和底层存储基础设施仍待收敛，Mock 不因此开放真实生成或视频导入。
- 包导出目前指向 TS/TSX 源码；`build` 生成 JS 和声明用于检查，不是已发布的通用 SDK。
- package 已移除 `/internal/*` 通配出口；web、demo 和新宿主都应使用主入口或明确命名的 contracts、adapter、feature 子路径，不穿透 `packages/canvas/src`。
- 基础图片/视频/音频导入、图像工具、生成图片/音视频及视频截帧保存、素材选择弹窗和左侧素材管理已使用宿主 adapter；原 web 相应素材已有按项目隔离的本地持久化目录，不迁移旧全局资产。Mock 继续使用内存图片目录。图像工具交互/像素、生成结果重试、取消、音视频真实播放、刷新和项目隔离仍待浏览器验收。
- 为保留原功能，旧模型请求、本地媒体/素材/配置 stores、Agent/插件 hooks 与部分全局样式一并迁入，仍待通过 adapter 解耦。旧宿主仍由前端保管 API Key 并直连模型；Mock 不启动这些请求，不能据此宣称已完成服务端安全迁移。
- 已有可注入 transport 的 HTTP adapter、上传票据/二进制上传与显式任务轮询 helper，但没有正式后端；demo 使用 Mock 手动查询，不代表生产任务自动轮询已接入。统一蒙版编辑任务与二值蒙版契约、完整版本恢复/分支/对比和统一导出仍未完成；当前没有正式 Spring Boot、PostgreSQL 或对象存储。

完整阶段计划见 `docs/content/docs/progress/interior-design-canvas-plan.mdx`，验收项见 `pending-test.mdx`。
