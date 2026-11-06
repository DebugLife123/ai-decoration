# AI 智能家装设计平台

面向家装团队与个人用户的 AI 装修设计平台。当前提供设计灵感首页、现场照片效果图生成、户型图全屋方案生成，以及面向团队的业务界面基础框架。

## 本地开发

```bash
npm install
Copy-Item .env.example .env
```

在 `.env` 中填写 `CODEX2API_API_KEY`，然后启动开发服务：

```bash
npm run dev
```

默认开发地址为 `http://localhost:5173`。AI 请求由 Vite 服务端网关转发，密钥仅保存在本地 `.env`，不要提交密钥文件。

## 模型配置

`.env.example` 提供默认 API 地址和已验证的视觉、生图模型标识。可按当前可用的上游模型调整 `AI_VISION_MODEL` 与 `AI_IMAGE_MODEL`。

## 全屋生成任务与排障

- 户型识别、效果图生成和空间复核分别使用 `AI_ANALYSIS_TIMEOUT_MS`、`AI_IMAGE_TIMEOUT_MS`、`AI_REVIEW_TIMEOUT_MS`。默认分别为 90000、180000、90000 毫秒；只针对瞬时网络错误及 408/429/502/503/504/524 在分析请求上重试一次，不自动重试图片生成，避免重复计费。
- 识别请求和全屋任务使用 `requestId` 关联服务端 JSON 日志。日志记录阶段、模型、耗时、状态码、上游请求 ID、原图与发送图的尺寸及体积；不记录密钥、图像内容或完整提示词。根据日志中的 `local_timeout`、HTTP 状态和 `failedStage` 区分本地截止、上游响应和具体失败阶段。
- 上传图纸目前最长边缩放到 2560 像素并转为 JPEG（质量 0.92）；未根据未经验证的延迟推测继续压缩。调整该预处理前，应使用相同的户型图检查空间漏识、文字标注和时延。
- `POST /api/ai/generate` 返回任务 ID，页面轮询 `GET /api/ai/generation-jobs/:id?summary=1` 获取阶段和新增图片。部分空间失败时保留全屋总览及已完成空间，可从预览页重试失败空间。每个服务进程同时最多运行 2 个、保留 8 个任务；完成后 1 小时过期，满额时更早淘汰最旧的已结束任务。任务和重试输入只保存在内存中，进程重启后任务 ID 失效。需要跨重启恢复时应迁移到持久化任务队列及对象存储。

## 校验

```bash
npm run build
npm run lint
node --experimental-strip-types --test server/aiGateway.test.mjs src/services/aiClient.test.mjs
```
