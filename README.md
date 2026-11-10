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

当前登录页支持个人和企业两种账号。登录服务使用 `VITE_BUSINESS_API_URL`：`vite dev` 下未配置时回落到
`http://localhost:8080`，生产构建未配置时走同源相对路径（需前置反代把 `/api` 转到后端），
**不会**回落到访问者自己机器上的 localhost。注册后会在浏览器会话中保存短期 JWT；企业账号访问企业资料、案例、报价和企业项目，个人账号的设计项目按个人身份隔离。
`VITE_BUSINESS_API_TOKEN` 仅用于本机开发时跳过登录的静态测试，不要配置真实生产令牌。

平台管理员没有公开注册入口，管理员账号仅能由运维在本地进程环境中显式开启一次性引导创建。不要通过个人或企业注册页创建管理员，也不要把管理员角色赋予企业账号。创建完成后关闭引导开关并清除密码环境变量，管理员从独立的 `/admin/login` 入口登录。

## 模型配置

`.env.example` 提供默认 API 地址和已验证的视觉、生图模型标识。可按当前可用的上游模型调整 `AI_VISION_MODEL` 与 `AI_IMAGE_MODEL`。

## Docker 部署

整套服务由根目录 `docker-compose.yml` 编排，四个服务：`postgres`（数据库）、`backend`（Spring Boot）、
`frontend`（Vite 构建产物）、`db-backup`（每日 pg_dump）。

```bash
# 1. 复制环境模板并填写必填项
Copy-Item .env.example .env
#    JWT_SECRET            必填，至少 32 字节，例如 openssl rand -base64 48
#    VITE_BUSINESS_API_URL 必填，浏览器访问后端的地址，例如 http://192.168.6.78:8080

# 2. 构建并启动
docker compose up -d --build

# 3. 查看状态与日志
docker compose ps
docker compose logs -f backend
```

启动后前端在 `http://localhost:4175`，后端在 `http://localhost:8080`。

### 三个关键约束

1. **`VITE_BUSINESS_API_URL` 是构建期变量**，不是运行期。它被 Vite 编译进 JS bundle，
   所以改了它必须 `docker compose build frontend` 重新构建，改 `.env` 后重启容器无效。
   留空时前端走同源相对路径，此时需要前置反向代理把 `/api` 转发到 backend。
2. **`JWT_SECRET` 缺失会导致后端启动失败**，这是刻意的。`prod` profile 里
   `app.security.jwt-secret: ${JWT_SECRET}` 没有默认值，避免误用仓库里的开发密钥。
3. **`ADMIN_BOOTSTRAP_ENABLED` 在 compose 里固定为 `false`**。需要创建平台管理员时，
   临时用 `docker compose run` 覆盖该变量完成一次性引导，完成后立即移除。

### 数据持久化与备份

| 卷 | 内容 |
|---|---|
| `postgres-data` | PostgreSQL 数据目录（`PGDATA=/var/lib/postgresql/data/pgdata`） |
| `uploads-data` | 企业上传素材，对应容器内 `/data/uploads` |
| `db-backups` | pg_dump 产物，`daily/` 保留最近 7 份 + `monthly/` 每月 1 号一份 |

`db-backup` 服务启动时先热备一次，之后每 24 小时一次。dump 先写 `.partial` 再 `mv`，
避免中途失败留下半截文件被当成有效备份。**卷里的备份仍在同一台机器上，生产环境需要另外同步走。**

```bash
# 手动触发一次备份
docker compose exec db-backup pg_dump -h postgres -U decoration -d decoration -F c -f /backups/daily/manual.dump

# 从备份恢复
docker compose exec -T postgres pg_restore -U decoration -d decoration --clean --if-exists < daily.dump
```

### 生产安全默认值

`SPRING_PROFILES_ACTIVE=prod`（compose 默认）时会加载 `application-prod.yml`：

- `management.endpoints.web.exposure.include: health` —— 只留健康探针，`/actuator/env` 等不再暴露；
- `management.endpoint.health.show-details: never` —— 探针不吐组件明细；
- 管理端 bootstrap 关闭；
- `JWT_SECRET` 无默认值，必须外部注入。

CORS 白名单默认只放行本机 `5173/5174/4173/4175`。生产域名通过 `CORS_ALLOWED_ORIGINS`
（逗号分隔）追加，未列入的来源预检返回 403。

### 上传白名单

`BusinessAssetService` 只接受 **JPG / PNG / WEBP / GIF / BMP / PDF**，单文件上限 15 MB
（`APP_MAX_FILE_SIZE_BYTES`，需与 `spring.servlet.multipart.max-file-size` 同步调整）。
扩展名与声明的 Content-Type 必须同时命中白名单。**明确不支持 SVG** —— SVG 可以内嵌
`<script>`，一旦被浏览器内联渲染就是存储型 XSS。

## 全屋生成任务与排障

- 户型识别、效果图生成和空间复核分别使用 `AI_ANALYSIS_TIMEOUT_MS`、`AI_IMAGE_TIMEOUT_MS`、`AI_REVIEW_TIMEOUT_MS`。默认分别为 90000、180000、90000 毫秒；只针对瞬时网络错误及 408/429/502/503/504/524 在分析请求上重试一次，不自动重试图片生成，避免重复计费。
- 识别请求和全屋任务使用 `requestId` 关联服务端 JSON 日志。日志记录阶段、模型、耗时、状态码、上游请求 ID、原图与发送图的尺寸及体积；不记录密钥、图像内容或完整提示词。根据日志中的 `local_timeout`、HTTP 状态和 `failedStage` 区分本地截止、上游响应和具体失败阶段。
- 上传图纸目前最长边缩放到 2560 像素并转为 JPEG（质量 0.92）；未根据未经验证的延迟推测继续压缩。调整该预处理前，应使用相同的户型图检查空间漏识、文字标注和时延。
- `POST /api/ai/generate` 返回任务 ID，页面轮询 `GET /api/ai/generation-jobs/:id?summary=1` 获取阶段和新增图片。部分空间失败时保留全屋总览及已完成空间，可从预览页重试失败空间。每个服务进程同时最多运行 2 个、保留 8 个任务；完成后 1 小时过期，满额时更早淘汰最旧的已结束任务。任务和重试输入只保存在内存中，进程重启后任务 ID 失效。需要跨重启恢复时应迁移到持久化任务队列及对象存储。

## 校验

```bash
npm run build
npm run lint
npx tsc -b
node --experimental-strip-types --test server/aiGateway.test.mjs src/services/aiClient.test.mjs

# 后端测试（需要本机 PostgreSQL，或设置 DATABASE_TEST_URL 指向测试库）
cd backend
mvnw.cmd -B test
```

CI（`.gitlab-ci.yml`）分两个 verify job：

- `verify_frontend`：`npm ci` → `npm run lint` → `npx tsc -b` → `npm run build` → compose 语法校验；
- `verify_backend`：用 `backend/docker-compose.test.yml` 起临时 PostgreSQL，然后在 runner 主机上直接跑 `backend/mvnw.cmd -B test`。

`verify_backend` 不依赖 runner 预装 Maven，也不需要能拉 Docker Hub：Maven 由 wrapper 固定在 3.9.9，JDK 21 由 `scripts/ensure-jdk21.ps1` 现找现装（找不到就下一个 Adoptium 21 解压到 `%LOCALAPPDATA%\dsh\jdk21`，同一个 runner 上装一次即长期复用）。唯一的镜像依赖是 `postgres:16-alpine`，通常已在 runner 上缓存；若缓存被清且拉不动，可把 `POSTGRES_TEST_IMAGE` 设为 `docker.m.daocloud.io/library/postgres:16-alpine`。

两个 `Dockerfile` 的基础镜像都通过 `ARG REGISTRY` 走 `docker.m.daocloud.io` 代理（本环境访问不了 docker.io），可用 `--build-arg REGISTRY=` 传空值回到默认仓库。

`deploy_production` 需要 `JWT_SECRET` 与 `VITE_BUSINESS_API_URL` 两个 CI/CD 变量，缺失直接失败。
