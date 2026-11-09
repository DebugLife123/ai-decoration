# 后续计划 v3（据实模板校准版）

> 基线：分支 `codex/business-data` @ `78c4357 feat(budget): 报价计量单位枚举化并引入最低计量规则（2a-1）`
> 编写时间：2026-11-09（2a-1 完成后更新）
> 上一版：v2（2026-11-07），差异见 §0
> 本版新增依据：`D:\开发\预算模板表.xlsx` 实表解析结果 → [BUDGET_SECTIONS.md](BUDGET_SECTIONS.md)

---

## 0. 与 v2 的差异

| # | v2 | v3 | 依据 |
|---|---|---|---|
| 1 | 预算 6 个分项 | **9 个板块**，管理费单列 | 实表是「建安 7 分部 + 主材 9 分部」，6 分项漏了「家具制作」 |
| 2 | 管理费 12% | **管理费 10%** | 模板 `建安预算!G350 = (G348+G349)*0.1` |
| 3 | 一个综合单价 | **材料价、人工价分两路** | 模板每行 `G = D×(E基材 + F人工)`，合成单价会抵消涨跌 |
| 4 | 单位 6 类 | **11 类**（含复合单位） | 实表出现 `m/级`、`m2/层`、`cm/m2`、`套米`、`户`、`间` 等 20 种写法 |
| 5 | 无最低计量 | **8 条 `min_qty` 规则** | 模板备注：「不足 85㎡ 按 85㎡」「柜门不足 0.4㎡ 按 0.4㎡」等 |
| 6 | 只有清单式计价 | **增加套餐式 `PACKAGE`** | 模板「全包外部」整张表就是套餐报价，真实装企过半走套餐 |
| 7 | 所有项目都计价 | **增加 `GIFT` / `OWNER_SUPPLIED`** | 模板有「赠送项目」「客户自购材料项目」两张整表 |
| 8 | 阶段 2a 是一个整体 | **拆成 2a-1 ~ 2a-5 五步**，每步可独立上线 | 第 1 步不依赖任何报价数据，可立即做 |
| 9 | 损耗率 10~12% | **地板/吊顶 5%、瓷砖 8%、涂料 10%** | 模板 `木地板 D6 = 建安!D12*1.05`、`瓷砖 = *1.08` |
| 10 | 墙面面积用系数 2.55 | 优先「周长×层高−门窗半−家具」，无层高才退回系数 | 模板 `编制说明` ⑶ |

v2 里的阶段 0（部署）、阶段 1（合并 + 契约）仍然有效，本版保留并补充了验收细节。

---

## 1. 现状基线（可核对）

```
分支      codex/business-data @ 78c4357，领先 origin/main 20 个提交
合并      origin/main 是当前分支祖先 → fast-forward，无冲突
前端      src/ 84 files；21 条路由；tsc -b 通过，oxlint 0 error（6 warning）
后端      Java 4,388+ 行；74 个 controller 方法级映射
测试      10 个测试类 / 49 项，mvn -o test 全绿
数据库    Flyway V1–V20，25 张表，下一版 V21
契约      contracts/openapi.yaml 仅 40 个 operationId，缺 33 个
部署      Dockerfile 只有 vite preview；compose 只有 1 个服务，无 backend / 无 postgres
```

### ✅ 已完成：阶段 2a-1（提交 78c4357）

| 项 | 落地情况 |
|---|---|
| `unit_kind` 11 类枚举 | V20 迁移 + `BudgetUnitKind.fromLabel`，两处映射一致 |
| `unit_unknown` | 回填后 `木地板(mm)`、`墙纸(mm)` 被标记，不参与计算 |
| `item_nature` | INCLUDED / GIFT / OWNER_SUPPLIED，非法值 400 |
| `budget_min_qty` | 8 条规则入库（85㎡ / 90㎡ / 0.4㎡ / 1.6㎡ / 1㎡ / 20㎡ / 15㎡ / 1000mm） |
| `labor_quotes.admin_hidden` | 已补齐，与 material_quotes 对齐 |
| 企业端单位下拉 | 13 个选项；历史脏数据显式列出「未识别：mm（请重选）」 |
| 报价列表提示 | `⚠ 单位待修正` + 「暂无报价参与预算估算」 |

实测确认：API 创建 `㎡`→SQM、`mm`→UNKNOWN、`m/级`→LM_PER_LEVEL；PATCH 把 mm 改成 ㎡ 后 `unit_unknown` 自动转 false；赠送项落 GIFT。

### 仍待解决的四个「地基级」缺口

| # | 缺口 | 后果 | 归属阶段 |
|---|---|---|---|
| 1 | 生产容器里没有后端 | 部署后只有前端，登录/材料/通知全不可用 | 阶段 0 |
| 2 | `VITE_BUSINESS_API_URL` 构建期注入但 Dockerfile 无 `ARG` | 部署后浏览器请求用户自己的 `localhost:8080` | 阶段 0.3 |
| 3 | ~~`unit` 是自由文本~~ | ✅ 已由 2a-1 解决 | — |
| 4 | 契约落后 33 个接口 | 前后端并行开发时接口漂移 | 阶段 1.2 |

---

## 阶段 0 · 部署前置（阻塞项）

**为什么必须先做**：即使配好生产库和域名，前端仍会请求用户本机的 `localhost:8080`。这个故障表现为网络超时，排查成本极高。

### 0.1 后端容器化

- [ ] `backend/Dockerfile` 多阶段构建
  - builder：`maven:3.9-eclipse-temurin-21`，`mvn -B -DskipTests package`
  - runtime：`eclipse-temurin:21-jre`，非 root 用户，`JAVA_OPTS` 可注入
  - `APP_UPLOAD_DIR=/data/uploads`
- [ ] `backend/.dockerignore`：排除 `target/`、`var/`
- [ ] 验证：`docker build` 产物体积 < 300MB

### 0.2 三服务 compose

| 服务 | 镜像 | 端口 | 卷 | 健康检查 |
|---|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 内部 | `decoration-postgres-data` | `pg_isready` |
| `backend` | 本地构建 | 内部 8080 | `decoration-uploads:/data/uploads` | `GET /actuator/health` |
| `frontend` | 本地构建 | `4175:4173` | — | `GET /` |

- [ ] `frontend depends_on: backend: condition: service_healthy`
- [ ] `backend depends_on: postgres: condition: service_healthy`
- [ ] 环境注入：`SPRING_DATASOURCE_URL / USERNAME / PASSWORD`、`APP_SECURITY_JWT_SECRET`、`APP_STORAGE_LOCAL_DIR`

### 0.3 前端 API 地址注入（关键）

- [ ] 根 `Dockerfile` 加 `ARG VITE_BUSINESS_API_URL` + `ENV VITE_BUSINESS_API_URL=$VITE_BUSINESS_API_URL`
- [ ] CI `deploy_production` 的 `docker build` 加 `--build-arg VITE_BUSINESS_API_URL=<生产地址>`
- [ ] **移除** `src/services/authSession.ts:29` 与 `src/services/businessData.ts:323` 的 `|| 'http://localhost:8080'` 兜底，改为构建期缺失即抛错
- [ ] 同域反代 `/api` → backend（避免 CORS 配置负担）

### 0.4 数据与备份

- [ ] 命名卷 `decoration-postgres-data`、`decoration-uploads`
- [ ] 每日 `pg_dump`，保留 7 天 + 每月 1 份
- [ ] uploads 目录同步备份（含 `business_assets` 关联实体文件）

### 0.5 生产安全

- [ ] `APP_SECURITY_JWT_SECRET` 从环境注入，禁用 `application.yml` 默认值
- [ ] `ADMIN_BOOTSTRAP_ENABLED` 保持关闭
- [ ] `management.endpoints.web.exposure.include` 生产仅 `health`
- [ ] 上传大小与 `media_type` 白名单复核（当前 15MB / 16MB）

### 0.6 CI 补后端测试

- [ ] `.gitlab-ci.yml` verify 阶段新增 `backend_test` job
  - `mvn -B test`，需要 PostgreSQL service 容器（`BusinessDataPostgresIntegrationTest` 直连真实库）
- [ ] 独立 `tsc -b` 校验（`npm run build` 已含，但失败信息不够清晰）

### 阶段 0 验收

1. 干净机器 `docker compose up -d` 三服务全起，无手工干预
2. `http://localhost:4175` 可完成：注册 → 登录 → 建项目 → 企业录报价 → C 端可见
3. `docker compose restart` 后数据与上传文件完好
4. 后端停机时前端明确提示「无法连接服务」，而非静默超时

**工期**：1–2 天

---

## 阶段 1 · 合并与契约补齐

### 1.1 合并

- [ ] `git fetch origin`
- [ ] 确认 `origin/main` 仍是祖先 → fast-forward
- [ ] 合并后推 `main` 触发 CI，全绿再部署
- [ ] 注意：本地 `main` 落后 `origin/main` 22 个提交，**不要**往本地旧 `main` 上合

### 1.2 契约补齐（33 个 operation）

| 分组 | 缺失接口 |
|---|---|
| 通知 | `GET /api/v1/notifications`、`PATCH /{key}/read`、`POST /read-all` |
| 询价 | `POST /api/v1/inquiries`、`GET /api/v1/business/inquiries`、`PATCH /{id}/status` |
| 公开案例 | `GET /api/v1/cases`、`GET /{caseId}/files/{fileId}` |
| 公开企业页 | `GET /api/v1/companies/{companyId}`、`/assets/{assetId}` |
| 材料目录 | `GET /api/v1/materials` |
| 风格 | `GET /api/v1/styles/recommendations`、`GET/PUT /api/v1/business/style-profiles` |
| 素材 | `POST/GET/DELETE /api/v1/business/assets*`（4 个） |
| 完备度 | `GET /api/v1/business/completeness` |
| 管理端 | `admin/certifications`(3)、`admin/marketplace`(4)、`admin/assets`(3)、`admin/audit-logs`(1) |
| 案例发布 | `POST /api/v1/business/cases/{caseId}/publish` |
| 管理员登录 | `POST /api/v1/auth/admin/login` |

- [ ] 逐个补 `paths` + `schemas` + 错误响应矩阵
- [ ] `qa/contract-test-plan.md` 新增管理端、通知、询价、公开目录四章

### 1.3 生产三角色验收

- [ ] 企业注册 → 提交认证（PDF/图片）→ 管理员审核通过 → 企业收到通知
- [ ] 企业录入材料报价（多图）+ 人工报价 + 风格资料
- [ ] 未认证企业报价**不进入** C 端材料库
- [ ] 管理员下架材料 → C 端立即不可见
- [ ] 个人：浏览 → 筛选 → 收藏 → 对比 → 加入项目 → 项目详情可见
- [ ] 个人咨询企业 → 企业端收到 → 状态流转 NEW→CONTACTED→QUOTED→CLOSED
- [ ] 预算页风格推荐显示企业来源标记
- [ ] 管理员审计日志可见上述审核/下架动作

**工期**：1 天

---

## 阶段 2a · 预算建模（拆五步）

### 2a-0 为什么要拆

模板给出的真实预算是这个结构：

```
第一层 建安预算   7 个分部（地面/顶面/墙面门窗/家具制作/水电/结构/措施）
第二层 主材项目   9 个分部（木地板/瓷砖/石材/卫浴/合金门/橱柜/吊顶/开关灯具/成品门）
合计   直接费 → 管理费 10% → 总造价 → 税金 5.36% / 远程 2% / 楼霸 单独收
```

而 v2 的 6 分项是拍脑袋划分的，有三处结构性错误：

| 错误 | 后果 |
|---|---|
| 漏掉「家具制作工程」（柜体 350+100/㎡） | 最容易超支的一项完全缺失 |
| 把「措施费」（成品保护/垃圾清运/上楼/防开裂）混进管理费 | 小户型严重低估 |
| 没有「套餐式」计价 | 真实装企过半的单子走套餐，平台算不出来 |

所以 2a 不能一次做完，必须按「不依赖数据 → 依赖数据」的顺序拆五步。

### 2a-1 单位治理 + 最低计量（✅ 已完成，提交 78c4357）

**这一步不改算法、不依赖任何报价数据，做完准确率立刻提升。**

#### 已落地的 V20 迁移（摘要）

```sql
-- 单位枚举化：11 类，覆盖实表 20 种写法
alter table material_quotes
    add column unit_kind    varchar(20),
    add column unit_unknown boolean not null default false,
    add column item_nature  varchar(20) not null default 'INCLUDED';

alter table labor_quotes
    add column unit_kind    varchar(20),
    add column unit_unknown boolean not null default false,
    add column item_nature  varchar(20) not null default 'INCLUDED',
    add column admin_hidden boolean not null default false,
    add column admin_hidden_reason varchar(500);

-- 回填后：mm 落 UNKNOWN（不再被当成 SQM），8 条最低计量规则写入 budget_min_qty
```

完整迁移见 `backend/src/main/resources/db/migration/V20__add_budget_unit_and_nature.sql`，
枚举映射见 `backend/src/main/java/com/decoration/budget/BudgetUnitKind.java`。

#### 验收结果

| # | 判据 | 结果 |
|---|---|---|
| 1 | `木地板(mm)`、`墙纸(mm)` 标 `unit_unknown = true`，不参与计算 | ✅ DB 实测 6 条中 2 条为 UNKNOWN |
| 2 | `㎡` → SQM、`延米` → LM、`樘` → PIECE、`m/级` → LM_PER_LEVEL 等 | ✅ 单测 + API 实测 |
| 3 | 企业改对单位后标记自动取消 | ✅ PATCH 实测 mm→㎡ 后转 SQM |
| 4 | `GIFT` / `OWNER_SUPPLIED` 可落库，非法值 400 | ✅ 实测 |
| 5 | 企业端无法再提交自由文本单位 | ✅ 下拉 13 选项，required |
| 6 | 8 条最低计量规则入库 | ✅ `budget_min_qty` 实测 8 行 |

> 最低计量规则目前只入库，**尚未被计算服务消费**——那是 2a-2 的工作。

**工期**：0.5 天（已用）

---

### 2a-2 板块细分：6 → 9（保持总额不变）

#### 9 个板块

| key | 显示名 | 对应模板分部 | 计算基准 |
|---|---|---|---|
| `GROUND` | 地面工程 | 建安一 | 套内面积 × 铺装率 |
| `CEILING` | 顶面工程 | 建安二 | 套内面积 × 吊顶率 |
| `WALL_DOOR` | 墙面与门窗 | 建安三 | 周长×层高−门窗半−家具 |
| `CARPENTRY` | 家具制作 | 建安四 | 延米（按户型推定） |
| `PLUMBING_ELEC` | 水电改造 | 建安五 | 套内面积（最低 85㎡） |
| `STRUCTURE` | 结构改造 | 建安六 | 默认 0，用户勾选 |
| `MEASURES` | 措施与杂费 | 建安七 | 直接费百分比 + 层数 |
| `MAIN_MATERIAL` | 主材（地板/瓷砖/石材/门） | 主材一/二/三/五/九 | 上游板块用量 × 损耗 |
| `FIXTURE` | 设备与洁具（卫浴/吊顶/开关/橱柜） | 主材四/六/七/八 | 套 / 户 / 延米 |

#### 基准区间（`budget_reference_bands`）

从现有 `BudgetPage.tsx:17-24` 的 6 条常量拆分而来，**合计严格守恒**：

| 板块 | BASIC 低–高（元/㎡） | 来源 |
|---|---|---|
| GROUND | 190 – 330 | 拆自「泥瓦与防水」+「地板瓷砖主材」 |
| CEILING | 70 – 120 | 拆自「墙顶面与涂装」 |
| WALL_DOOR | 180 – 310 | 拆自「墙顶面与涂装」+「泥瓦与防水」 |
| CARPENTRY | 240 – 420 | **新增**（原方案没有，从主材与定制里让出） |
| PLUMBING_ELEC | 320 – 520 | 沿用「拆改与水电」 |
| STRUCTURE | 50 – 100 | 拆自「拆改与水电」 |
| MEASURES | 180 – 320 | 沿用「安装辅料与管理」（2a-5 会把管理费拆出去） |
| MAIN_MATERIAL | 400 – 680 | 拆自「地板瓷砖等主材」 |
| FIXTURE | 160 – 310 | 拆自「厨卫与定制收纳」 |
| **合计** | **1790 – 3110** | 与原 6 项完全一致 ✓ |

三档展开仍用 `finishLevels` 的 `0.82 / 1.00 / 1.34`。

#### 工作量系数表（`workload_factors`）

| item_key | basis | per_sqm | waste_rate | 依据 |
|---|---|---|---|---|
| `GROUND` | INTERIOR_AREA | 0.72 | 0.05 | 模板 `木地板 D6 = 建安!D12*1.05` |
| `CEILING` | INTERIOR_AREA | 0.55 | 0.05 | 模板 `集成吊顶 *1.05` |
| `WALL_DOOR` | WALL_AREA | 1.00 | 0.08 | 模板 `瓷砖 *1.08` |
| `CARPENTRY` | INTERIOR_AREA | 0.35（延米/㎡） | 0.03 | 柜体延米经验值 |
| `PLUMBING_ELEC` | INTERIOR_AREA | 1.00 | 0 | 按面积计，非按量 |
| `STRUCTURE` | INTERIOR_AREA | 0（默认不含） | 0 | 需用户勾选 |

> 这些仍是经验初值。真正的校准见 §2a-6。

#### 与 v2 的回归基准保持一致

v2 的验收第 1 条是「清空报价时输出与前端计算逐项差值 = 0」。
v3 因为板块变多，判据改为：**9 个板块合计 = 前端 6 项计算总额**（差值 0），单项不要求对应。

#### 验收

| # | 判据 |
|---|---|
| 1 | 无报价时 9 板块合计 = 前端 6 项总额（差值 0） |
| 2 | 每个板块可单独关闭（用户勾选），关闭后总额同步下降 |
| 3 | `STRUCTURE` 默认不勾选，勾选后按 50–100 元/㎡ 计入 |
| 4 | 响应里每项带 `basis` 字段说明按什么量算的 |

**工期**：1 天

---

### 2a-3 材料与人工分离计价

模板每行是 `G = D × (E 基材单价 + F 人工单价)`，两列分开。合成一个综合单价是错的——「材料降 5%、人工涨 5%」会被抵消，用户看不出钱花在哪。

- [ ] `BudgetItem` DTO 增加 `materialPriceLow/High`、`laborPriceLow/High`、`materialCostLow/High`、`laborCostLow/High`
- [ ] 单价区间各路独立取 P25/P75（材料取材料报价，人工取人工报价）
- [ ] 某一路无报价时：该路降级到 `budget_reference_bands` 的对应拆分占比，**另一路仍用真实报价**（不能整项降级）
- [ ] `budget_reference_bands` 增加 `material_ratio numeric(5,4)`（材料占该板块基准的比例）

材料占比初值（按模板条目粗略加权）：

| 板块 | 材料占比 |
|---|---|
| GROUND | 0.72 |
| CEILING | 0.55 |
| WALL_DOOR | 0.50 |
| CARPENTRY | 0.78 |
| PLUMBING_ELEC | 0.45 |
| STRUCTURE | 0.55 |
| MEASURES | 0.60 |
| MAIN_MATERIAL | 0.85 |
| FIXTURE | 0.82 |

#### 验收

1. 每个板块都能拆出 `materialCost` 与 `laborCost`，两者之和 = 该板块小计
2. 手工把某材料报价 +10%，只有 `materialCost` 变，`laborCost` 不动
3. 只有材料报价、无人工报价时，人工部分走基准而非 0

**工期**：1 天

---

### 2a-4 套餐式计价（`pricing_mode`）

模板 `全包外部` 整张表就是套餐报价：

```
合同总造价 = 套餐单价(元/㎡) × max(实测框架面积, 90㎡) + 增减项 + 管理费 10%
实测框架面积 = 室内面积 + 外墙 240mm
```

- [ ] `project_budget_estimates` 增 `pricing_mode varchar(16) not null default 'LIST'`
- [ ] 新增 `package_products(company_id, name, price_per_sqm, min_area, valid_until, items_json, status)`
- [ ] 套餐模式的计算路径：`area_measured = area × 0.78 + 0.24 × perimeter_estimate`，取 `max(area_measured, 90)`
- [ ] 套餐内项目清单（对应模板「配置内全包价」）与增项清单分开返回
- [ ] `pricing_mode` 由前端切换，两种模式结果不能混加

> 模板自身缺陷提醒：`全包外部!G49 = 1098*B3` 但文案写「898 元/㎡」，`G50 = #REF!`。
> 我们只抄结构和公式，不抄 898/1098 这两个数。

#### 验收

1. 90㎡ 与 60㎡ 输入得到相同基础价（最低 90㎡ 兜底生效）
2. 套餐模式不出现「家具制作」「结构改造」等清单项，只出套餐价 + 增项
3. `LIST` 与 `PACKAGE` 结果分别可复算

**工期**：1 天

---

### 2a-5 附加费与税金（口径变更，需重新基线）

模板三项「单独收取，不计入合同造价」：

| 项 | 公式 |
|---|---|
| 税金 | 总造价 × 5.36%（税前报价，代办代收） |
| 远程费用 | 总造价 × 2%（县城 5%） |
| 楼霸沙霸费用 | 无固定公式，按现场实际 |

外加措施：

| 场景 | 规则 |
|---|---|
| 层高 > 3500mm | 超出部分按实测面积另收 60 元/㎡ |
| 无电梯 | 材料上楼 600 元/层、模具搬运按实际层数 |
| 有电梯 | 材料上楼 100 元/层、模具搬运按两层计 |
| 复式 / 架空层 | 各加 1 层 |
| 材料货运 | 基础造价 × 1%（已含在措施费） |

- [ ] `MEASURES` 从 180–320 调整为 **40–80**（措施费本体）
- [ ] 新增独立行 `MANAGEMENT`：`(Σ直接费) × 10%`
- [ ] 新增可选行 `TAX`(5.36%) / `REMOTE`(2% 或 5%) / `FLOOR_SURCHARGE` / `HIGH_CEILING`
- [ ] 输入增加 `floorLevel`（楼层）、`hasElevator`、`ceilingHeight`、`isCounty`

⚠️ **这一步会改变输出总额，属于有意的口径变更，不是回归失败。**
需要：① 在 CHANGELOG 记录；② 前端明确显示「管理费 10%」「税金 5.36%」为独立行；③ 老的 `project_budget_estimates` 记录带 `model_version` 区分。

#### 验收

1. 层高 3800mm 时出现超高项，金额 = 超出面积 × 60
2. 无电梯 6 楼时上楼费 = 600 × 6
3. 税金、远程费单列，不计入「合同总造价」
4. 管理费 = 直接费 × 10%，与模板 `G350` 公式一致

**工期**：1 天

---

### 2a-6 系数校准（做完之后才做，持续）

模板系数是行业经验值，不是权威数据。真正校准路径：

```
对企业已录入的 business_cases（有 area + budget + style）
反推：实际造价 ÷ 面积 ÷ 基准单价 = 隐含 per_sqm
累计 ≥ 20 条后，用中位数替换初始系数
```

- [ ] 新增后台任务：每周日跑一次反推，输出建议系数表到日志
- [ ] 系数变更需人工确认，不在自动流程里直接生效
- [ ] 变更后 `budget_reference_bands` 带 `updated_at` + `source`（`SEED` / `CALIBRATED`）

---

### 阶段 2a 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/v1/budgets/estimate` | 试算，不落库，公开可访问（限流） |
| `POST` | `/api/v1/budgets` | 保存到项目，需归属校验 |
| `GET` | `/api/v1/budgets?projectId=` | 历史预算列表 |
| `DELETE` | `/api/v1/budgets/{id}` | 删除 |
| `GET` | `/api/v1/budget-reference-bands` | 公开基准区间（前端兜底用） |

响应结构：

```json
{
  "totalLow": 182400.00,
  "totalHigh": 304600.00,
  "dataQuality": "PARTIAL",
  "pricingMode": "LIST",
  "modelVersion": "v3",
  "items": [
    {
      "itemKey": "GROUND", "label": "地面工程",
      "source": "QUOTED", "basis": "INTERIOR_AREA",
      "qty": 67.4, "unitKind": "SQM",
      "materialPriceLow": 268.00, "materialPriceHigh": 299.00,
      "laborPriceLow": 45.00, "laborPriceHigh": 62.00,
      "materialCostLow": 17166.00, "laborCostLow": 3033.00,
      "companyCount": 2,
      "appliedMinQty": null,
      "quoteSamples": [
        { "name": "浅橡木复合地板", "price": 268.00, "companyName": "栖居美学设计" }
      ]
    }
  ],
  "surcharges": { "management": 18240.00, "tax": 0, "remote": 0 },
  "warnings": ["GROUND 仅 2 家企业报价，未达 3 家门槛"]
}
```

---

### 阶段 2a 全期验收

| # | 判据 | 归属 |
|---|---|---|
| 1 | 无报价时 9 板块合计 = 前端 6 项总额 | 2a-2 |
| 2 | 60㎡ 房子水电按 85㎡ 计价（消费 `budget_min_qty`） | 2a-2 |
| 3 | ~~`unit_unknown` 报价不参与任何计算~~ | ✅ 2a-1 已建索引与标记，2a-2 保证计算时应用 |
| 4 | `GIFT` / `OWNER_SUPPLIED` 不计入合计但列得出来 | 2a-2 |
| 5 | 每板块可拆材料/人工，两者之和 = 小计 | 2a-3 |
| 6 | 90㎡ 与 60㎡ 套餐基础价相同 | 2a-4 |
| 7 | 管理费 = 直接费 × 10%，与模板一致 | 2a-5 |
| 8 | 无电梯 6 楼上楼费 = 600 × 6 | 2a-5 |
| 9 | 后端停机时预算页仍可用（前端兜底） | 2b |
| 10 | 每个子步骤有独立单测，`mvn -o test` 全绿 | 全部 |

---

## 阶段 2b · 预算 UI

- [ ] 三段式：**直接费 → 管理费/税金 → 合同总造价**（对齐模板合计区）
- [ ] 明细表列：板块 | 单位 | 数量 | 材料单价 | 人工单价 | 小计 | 来源标记
- [ ] 每板块可展开看 `quoteSamples`（哪家企业、什么价）
- [ ] `dataQuality` 三态文案
  - `QUOTED`：「基于 N 家企业的现行报价」
  - `PARTIAL`：「部分板块基于企业报价，其余为行业参考」
  - `REFERENCE`：「行业参考区间，尚无可比企业报价」
- [ ] 标记 `GIFT`（赠送，标注参考价值）与 `OWNER_SUPPLIED`（客户自购，不计价）
- [ ] 计价模式切换：清单式 / 套餐式
- [ ] 超支提醒：`total > 预算` 时顶部横幅 + 差额
- [ ] 面积/地区/风格/楼层变更防抖重算
- [ ] 「保存到项目」→ 项目详情可见历史预算（带 `modelVersion`）
- [ ] 替换 `BudgetPage.tsx:136` 的演示文案
- [ ] **保留前端本地兜底**：后端不可用时用 `referenceCosts` 的 9 板块版计算，页面不白屏

**工期**：2 天

---

## 阶段 2c · 顺带低成本项（建议插在 2b 之后）

- [ ] **通知未读角标**：`GET /api/v1/notifications/unread-count` + `Navbar.tsx` 红点
- [ ] **收藏落库**：`user_favorites(user_id, target_type, target_id, created_at)` + 3 个接口 + localStorage 一次性迁移
  - 现在 `MaterialsPage.tsx:16-54` 全走 localStorage，越晚迁移成本越高

**工期**：1 天

---

## 阶段 3 · 资料展示增强

- [ ] 案例附件分类：`business_assets` 增 `kind`（效果图/施工图/户型图/现场照片/说明文档）+ `position`
- [ ] 企业主页按类别分组展示 + 筛选
- [ ] 图片封面标记 + 拖拽排序
- [ ] 上传进度、单张失败重试、图片压缩、尺寸格式提示
- [ ] 企业主页材料分类展示
- [ ] 营业状态（按营业时间实时计算「营业中/已打烊」）

---

## 阶段 4 · 用户关系

- [ ] 咨询回复内容 + 时间线 + 快速回复模板 + 关闭原因
- [ ] 用户端查看咨询进度
- [ ] 咨询转报价
- [ ] 收藏企业/案例 + 收藏夹分类 + 失效提醒
- [ ] 报价到期定时任务（当前仅 GET 时现算）
- [ ] 通知优先级、筛选、搜索、自定义开关

---

## 阶段 5 · 运营与商业化

- [ ] 管理端数据统计（企业数、报价数、认证通过率、咨询转化）
- [ ] 企业资料完整度统计
- [ ] 材料/案例审核规则
- [ ] 用户行为统计
- [ ] 订单与套餐体系
- [ ] AI 生成次数 / 会员权益
- [ ] 微信、支付宝支付

---

## 明确不做（或暂缓）

| 项 | 原因 |
|---|---|
| 企业员工账号与角色体系 | 已决定单企业账号 |
| 微信/支付宝支付 | 依赖订单体系，阶段 5 之后 |
| 图片断点续传 | 单文件 ≤15MB，收益远低于成本 |
| 案例附件的 AI 自动分类 | 数据量不足以验证规则 |
| 多端实时推送 | 当前无移动端 |
| 照抄模板的 16 个分部 | 用户只给面积，给不出「几扇柜门/几米包管」，绝大多数条目无法触发 |
| 模板里的具体数值（898 元/㎡、1098 元/㎡） | 模板自身矛盾，属单家企业口径 |

---

## 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 前端 API 地址构建期注入 | 部署后连不上后端，表现为超时 | 阶段 0.3，构建期缺失即失败 |
| `workload_factors` 系数无来源 | 预算不可信 | 先跑 v2 保守版，系数由 `business_cases` 反推（2a-6），UI 标注估算口径 |
| 报价数据严重不足（6 条材料 / 1 条人工） | 长期停留在 `REFERENCE`，看不到效果 | 2a 各步都能在无数据下交付；同时推动企业补录 |
| 门槛「3 家企业」导致地板类目永远降级 | 用户看不到真实报价 | 地板现只有 2 家（筑境、栖居），需补第 3 家；或按决定放宽门槛 |
| 2a-5 改变输出总额 | 老预算记录不可比 | `model_version` 字段隔离 |
| 合并后 CI 无后端测试 | 回归无法在流水线发现 | 阶段 0.6 |
| 契约文档持续落后 | 接口漂移 | 阶段 1.2 |
| 上传目录未挂卷 | 容器重启素材全丢 | 阶段 0.4 |
| `admin_hidden` 材料/人工不对称 | 下架材料后预算仍含该材料 | 2a-1 对齐字段 |

---

## 执行顺序与工期

```
阶段 0        1.5 天   ████████
阶段 1        1.0 天   ████
阶段 2a-1     0.5 天   ✅ 已完成（78c4357）
阶段 2a-2     1.0 天   ████
阶段 2a-3     1.0 天   ████
阶段 2a-4     1.0 天   ████
阶段 2a-5     1.0 天   ████
阶段 2b       2.0 天   ████████
阶段 2c       1.0 天   ████
─────────────────────────────
剩余          9.5 天
```

**依赖关系**：

```
阶段 0 ──→ 阶段 1 ──→ 生产验收
   │
   └──→ 2a-1 ──→ 2a-2 ──→ 2a-3 ──→ 2b
                     │
                     └──→ 2a-4 ──→ 2a-5
```

- 阶段 0 必须先于任何「生产验收」
- 2a-1 与阶段 0/1 **完全解耦**，可以并行，是全表性价比最高的一步
- 2a-2 必须先于 2a-3/2a-4（板块定了才能拆材料/人工、才能做套餐）

---

## 建议的下一步

1. **已完成**：2a-1（单位治理 + 最低计量 + `item_nature`），提交 78c4357
2. **下一步建议**：阶段 0.1–0.3（后端 Dockerfile + 三服务 compose + API 地址注入），1.5 天
3. 或者继续 2a-2（板块 6 → 9 + 消费 `budget_min_qty`），1 天

阶段 0 是三服务能真正跑起来的前提；2a-2 是把预算从「6 个拍脑袋分项」换成「9 个对齐模板的板块」。
两者可并行，取决于当前优先级是「先能部署」还是「先算得准」。
