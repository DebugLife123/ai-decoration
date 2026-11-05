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

当前登录页支持个人和企业两种账号。登录服务使用 `VITE_BUSINESS_API_URL`（未配置时默认
`http://localhost:8080`），注册后会在浏览器会话中保存短期 JWT；企业账号访问企业资料、案例、报价和企业项目，个人账号的设计项目按个人身份隔离。
`VITE_BUSINESS_API_TOKEN` 仅用于本机开发时跳过登录的静态测试，不要配置真实生产令牌。

平台管理员没有公开注册入口，管理员账号仅能由运维在本地进程环境中显式开启一次性引导创建。不要通过个人或企业注册页创建管理员，也不要把管理员角色赋予企业账号。创建完成后关闭引导开关并清除密码环境变量，管理员从独立的 `/admin/login` 入口登录。

## 模型配置

`.env.example` 提供默认 API 地址和已验证的视觉、生图模型标识。可按当前可用的上游模型调整 `AI_VISION_MODEL` 与 `AI_IMAGE_MODEL`。

## 校验

```bash
npm run build
npm run lint
```
