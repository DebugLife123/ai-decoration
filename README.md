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

## 校验

```bash
npm run build
npm run lint
```