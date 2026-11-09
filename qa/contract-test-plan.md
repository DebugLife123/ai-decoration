# 企业业务 API 契约验收方案

## 1. 目的与范围

本方案用于验收 `decoration-framework` 的企业业务 API 契约，覆盖三大角色下的全部 81 个 operation：

- **企业侧（COMPANY_*）**：企业资料、案例、材料报价、人工报价、素材库、完备度、风格资料、询价处理
- **个人用户（PERSONAL_USER）**：公开案例目录、公开企业页、材料目录、询价发起、通知
- **平台管理员（PLATFORM_ADMIN）**：管理员登录、认证审核、企业导入与代录、材料下架、素材清理、审计日志

第 4–11 章是企业侧四类资源与通用规则的验收基线；第 12–15 章分别覆盖管理端、通知、询价、公开目录；第 16–18 章是执行分层、通过标准与遗留决策。

契约与实现均已落地（`contracts/openapi.yaml`：81 operation / 120 schema / 11 个共享 response；后端 `backend/src/main/java/com/decoration/**/*Controller.java` 实测同为 81 个 (verb, path)）。因此本文件的验收项分为：

1. **静态契约检查**：只读取 `contracts/openapi.yaml` 即可执行，不依赖数据库或运行中的服务。
2. **集成测试**：需要可启动的后端、PostgreSQL、身份认证和至少两个企业租户的数据夹具。

本文件描述验收语义，接口细节以 OpenAPI 为准；若文中候选路径或字段名与 OpenAPI 不一致，以 OpenAPI 为准，但验收语义必须保留。

## 2. 当前基线与待确认假设

### 2.1 已有统一响应基线

现有后端 `ApiResponse<T>` 规定所有业务响应包含：

| 字段 | 类型 | 要求 |
| --- | --- | --- |
| `code` | string | 成功固定为 `OK`；失败为稳定、可机读错误码 |
| `message` | string | 面向调用方的简短说明，不得包含堆栈、SQL 或密钥 |
| `data` | object / array / null | 成功载荷；失败时为 `null` |
| `timestamp` | string(date-time) | ISO 8601 时间，必须可解析并带时区 |

现有异常处理已约定参数错误为 HTTP 400 + `VALIDATION_ERROR`，未预期错误为 HTTP 500 + `INTERNAL_ERROR`。契约已补齐 401、403、404、409、413、415 等稳定错误码，`ErrorResponse.code` 的完整枚举为：

`INVALID_REQUEST`、`VALIDATION_ERROR`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`IDEMPOTENCY_CONFLICT`、`VERSION_CONFLICT`、`UNSUPPORTED_MEDIA_TYPE`、`FILE_TOO_LARGE`、`INTERNAL_ERROR`。

`FILE_TOO_LARGE`（HTTP 413）是上传超限专用码，message 固定为「单个文件不能超过 15 MB」；单文件上限 15 MB、整请求上限 16 MB（`spring.servlet.multipart.max-file-size` / `max-request-size`，以及 `app.storage.max-file-size-bytes` 默认 15728640）。

### 2.2 资源路径与授权声明基线

路径已按实际实现固化，可直接从 `contracts/openapi.yaml` 发现：

- 企业侧：`/api/v1/business/{profile,cases,material-quotes,labor-quotes,assets,completeness,style-profiles,inquiries}`
- 个人侧：`/api/v1/{cases,companies,materials,inquiries,notifications,budgets}`
- 平台侧：`/api/v1/admin/{audit-logs,certifications,assets,marketplace}`
- 匿名入口：`POST /api/v1/auth/{register,login,admin/login}`、`GET /api/v1/health`、`GET /api/v1/styles/recommendations`、`POST /api/v1/budgets/estimate`（这六个 operation 在契约中声明 `security: []`，其余一律要求 bearer token）

企业归属由认证上下文确定：后端从 JWT 的 `companyId` claim 取值，缺失时回落到 `subject`；客户端无法通过请求体中的 `companyId` 切换数据归属。若最终路径显式包含企业 ID（如 `/api/v1/companies/{companyId}`、`/api/v1/admin/marketplace/companies/{companyId}`），也必须验证该 ID 与调用者的可见范围一致。

## 3. 契约级通用验收规则

### 3.1 静态契约检查

| 编号 | 检查项 | 通过标准 |
| --- | --- | --- |
| SC-001 | OpenAPI 可解析 | OpenAPI 3.1 文档语法、引用和 schema 均可解析，无悬空 `$ref` |
| SC-002 | 操作唯一性 | 每个 operationId 唯一、命名稳定，列表/创建/读取/更新/删除语义明确 |
| SC-003 | 统一响应信封 | 所有 2xx/4xx/5xx JSON 响应均引用统一 `ApiResponse`/`ErrorResponse`，字段与 2.1 一致 |
| SC-004 | Content-Type | JSON API 明确 `application/json`；上传若存在则明确 `multipart/form-data`、文件数量/类型/大小 |
| SC-005 | 身份认证 | 除明确公开接口外，每个企业业务 operation 都声明 security requirement；不得依赖可伪造的请求头作为企业身份 |
| SC-006 | 企业归属字段 | 创建/更新请求不得允许普通调用者写入或覆盖 `companyId`、`tenantId`、`createdBy`、`updatedBy` |
| SC-007 | 标识符格式 | 路径 ID 明确格式（建议 UUID），无效格式声明 400，不存在资源声明 404 |
| SC-008 | 时间字段 | `createdAt`、`updatedAt` 使用 `date-time` 且只读；`validUntil` 使用 `date` |
| SC-009 | 金额字段 | 材料/人工单价必须使用非字符串数值 schema，`exclusiveMinimum: 0`，精度/小数位有明确限制 |
| SC-010 | 列表空状态 | 列表响应允许空数组，空列表为 200，不以 404 表达 |
| SC-011 | 分页边界 | 若支持分页，`page/size` 或 cursor 有上下限；列表响应包含稳定分页元数据 |
| SC-012 | 错误枚举 | 至少定义 400/401/403/404/409/500；错误码、HTTP 状态和触发条件对应明确 |
| SC-013 | 幂等约定 | PUT/PATCH 的幂等语义明确；POST 是否支持 `Idempotency-Key` 及冲突行为有定义 |
| SC-014 | 乐观锁 | 更新/删除是否使用 `version`、ETag/`If-Match` 或 `updatedAt` 防止覆盖必须明确 |
| SC-015 | 枚举约束 | 案例状态等字段使用枚举，不能接受任意字符串 |
| SC-016 | 可空性 | required、nullable、默认值和只读字段一致；响应示例不得省略必填字段 |
| SC-017 | 未知字段 | 明确 `additionalProperties` 策略；推荐写请求拒绝未知字段或至少忽略且不持久化 |
| SC-018 | 敏感信息 | 企业资料响应不泄露凭证、内部审核备注、密钥、数据库字段或其他企业标识信息 |

### 3.2 通用错误响应矩阵

| 场景 | HTTP | 建议 `code` | 验收点 |
| --- | ---: | --- | --- |
| JSON 语法错误、字段类型错误 | 400 | `INVALID_REQUEST` | `data=null`；不返回 Java 类名或解析堆栈 |
| Bean Validation 失败 | 400 | `VALIDATION_ERROR` | message 能定位字段；同一字段规则稳定 |
| 未认证/令牌缺失或失效 | 401 | `UNAUTHORIZED` | 不返回任何企业业务数据 |
| 已认证但无权限 | 403 | `FORBIDDEN` | 不执行写操作；不泄露目标资源内容 |
| 本企业资源不存在 | 404 | `NOT_FOUND` | 返回统一信封 |
| 跨企业资源 ID | 404 或 403 | `NOT_FOUND` 或 `FORBIDDEN` | 全系统必须统一；推荐 404 以避免资源枚举 |
| 唯一约束/幂等键冲突 | 409 | `CONFLICT` / `IDEMPOTENCY_CONFLICT` | 不产生第二条数据 |
| 乐观锁冲突 | 409 或 412 | `VERSION_CONFLICT` | 不覆盖较新版本 |
| 不支持的媒体类型 | 415 | `UNSUPPORTED_MEDIA_TYPE` | 不进入业务处理 |
| 上传超限（单文件 > 15 MB） | 413 | `FILE_TOO_LARGE` | message 固定「单个文件不能超过 15 MB」；不落盘、不留半条记录 |
| 未预期异常 | 500 | `INTERNAL_ERROR` | 固定安全文案，不暴露内部细节 |

所有错误响应均应验证：`timestamp` 可解析、`data` 为 `null`、`code` 稳定、响应体不包含 SQL/堆栈/路径/令牌。

## 4. 企业资料契约

前端现有候选字段为 `name`、`city`、`services`、`intro`。最终契约应至少明确：

| 字段 | 候选规则 | 静态检查 | 集成检查 |
| --- | --- | --- | --- |
| `id` / `companyId` | UUID，只读 | response 中存在且 readOnly；write schema 不可写 | 修改请求携带该字段时被拒绝或忽略且不能改变归属 |
| `name` | 必填，trim 后非空，建议 1-160 字符 | min/maxLength | 空白、超长、首尾空格、Unicode 企业名称 |
| `city` | 可选，建议最大 80 字符 | maxLength/nullable | 空字符串规范化、超长值 |
| `services` | 可选；应决定为字符串还是字符串数组 | schema 类型唯一明确 | 空值、重复服务项、超长项 |
| `intro` | 可选，建议最大 2000 字符 | maxLength | 多行、HTML/脚本作为普通文本返回，防止存储型 XSS |
| `createdAt` / `updatedAt` | 服务端生成，只读 | format/readOnly | 创建后存在；更新后 `updatedAt` 单调增加 |
| `version` | 推荐整数，服务端维护 | minimum/readOnly | 并发更新冲突不覆盖新数据 |

集成测试重点：

- 企业 A 获取/更新资料时只能看到企业 A。
- 企业 A 不能通过 body/header/query 注入企业 B 的 ID。
- 企业资料不存在时，GET 返回约定的空对象或 404；二者必须在契约中唯一确定。推荐首次 GET 返回 200 + `data=null` 或默认空资料，避免把“尚未填写”误判为接口错误。
- 对同一完整 PUT 重放两次，最终资料、版本增长策略和响应必须符合幂等定义，不产生重复企业资料行。

## 5. 企业案例契约

前端现有候选字段：`title`、`area`、`style`、`budget`、`status`、`files`、`updatedAt`。

| 字段 | 候选规则 | 必测边界 |
| --- | --- | --- |
| `id` | UUID，只读 | 非 UUID 路径参数；不存在 ID；跨企业 ID |
| `title` | 必填，trim 后 1-160 字符 | 缺失、空白、超长、Unicode |
| `area` | 建议数值而非带“㎡”字符串，`>=0` | 0、负数、超精度、字符串 |
| `style` | 可选或必填需定稿；建议最大 80 字符/枚举 | 未知值、超长值 |
| `budget` | 建议 decimal，`>=0`，货币单位需固定 | 0、负数、超精度、字符串、极大值 |
| `status` | 枚举；候选 `draft`、`published`，默认 `draft` | 缺失默认、非法枚举、无发布权限 |
| `files` | 应使用资源对象/URL/文件 ID，不应只存客户端文件名 | 空数组、重复文件 ID、跨企业文件 ID、非法 URL |
| `createdAt` / `updatedAt` | 只读 date-time | 客户端伪造、更新时间变化 |

集成测试：

- 企业 A 创建案例后，A 的列表/详情可见，B 的列表不可见。
- A 访问 B 的 `caseId`，GET/PATCH/DELETE 均返回统一的 404 或 403，且 B 数据不变。
- 空列表返回 200 和空数组/空分页对象。
- 列表分页、排序、状态筛选不得混入其他企业数据。
- 重放同一个 `Idempotency-Key` + 相同 POST body，只创建一条并返回相同资源 ID；同一 key + 不同 body 返回 409。
- 若不支持幂等键，契约必须明确重复 POST 会创建新资源，并定义业务层防重策略；不能保持未说明状态。
- PATCH 只修改提交字段；未提交字段保持不变；显式 `null` 是否清空必须符合 schema。
- 删除后再次删除的语义需固定为 404 或幂等 204，不能随机变化。

## 6. 材料报价契约

前端现有候选字段：`name`、`spec`、`unit`、`price`、`category`、`region`、`validUntil`、`updatedAt`。

| 字段 | 候选规则 | 必测边界 |
| --- | --- | --- |
| `name` | 必填，trim 后 1-160 字符 | 缺失、空白、超长 |
| `spec` | 建议必填，最大 240 字符（现有迁移为 NOT NULL） | 缺失、空白、超长、特殊乘号/单位字符 |
| `unit` | 必填，1-40 字符 | 缺失、空白、超长 |
| `price` | decimal，`>0`，建议最多 2 位小数 | 0、负数、NaN/Infinity、字符串、3 位小数、极大值 |
| `category` | 必填，1-80 字符或受控枚举 | 缺失、空白、未知分类 |
| `region` | 必填，1-80 字符 | 缺失、空白、超长、地区大小写/空格规范化 |
| `validUntil` | 必填 date，不能早于业务日期 | 昨天、今天、闰日、非法日期、date-time 误传 |
| `updatedAt` | 服务端生成，只读 | 客户端伪造、更新后变化 |

重复报价需要产品明确自然键。建议候选自然键为：

`companyId + normalized(name) + normalized(spec) + unit + region + validUntil`

验收应覆盖：

- 同企业、同自然键重复 POST：按契约返回 409 或更新原报价，但不得静默创建不可区分的重复行。
- 不同企业可以提交完全相同的材料报价，彼此不冲突。
- 同企业相同材料但地区、规格或有效期不同，应允许分别存在。
- 列表筛选 `region/category/validAt` 后仍保持企业隔离。
- 过期报价是否默认从列表隐藏必须在契约中明确；无数据返回空列表。
- 消费端材料库若只允许读取“有效且可发布”的报价，企业草稿和过期数据不得泄漏。

## 7. 人工报价契约

前端现有候选字段：`type`、`unit`、`price`、`region`、`validUntil`、`updatedAt`。

| 字段 | 候选规则 | 必测边界 |
| --- | --- | --- |
| `type` | 必填，工种名称 1-160 字符 | 缺失、空白、超长、Unicode |
| `unit` | 必填，1-40 字符 | 缺失、空白、未知单位 |
| `price` | decimal，`>0`，最多 2 位小数 | 0、负数、字符串、超精度、极大值 |
| `region` | 必填，1-80 字符 | 缺失、空白、超长 |
| `validUntil` | 必填 date，不能早于业务日期 | 过去日期、今天、闰日、非法格式 |
| `updatedAt` | 服务端生成，只读 | 客户端伪造、更新后变化 |

建议自然键：

`companyId + normalized(type) + unit + region + validUntil`

集成验收与材料报价一致，并额外覆盖：

- 工种名称仅大小写、全半角或首尾空格不同的重复记录是否合并/冲突，规范化策略必须确定。
- 同工种使用不同计价单位（如“工日”和“㎡”）应允许并存。
- 无权限用户不能创建、修改或删除人工报价；只读角色只能 GET。

## 8. 企业数据隔离测试设计

### 8.1 数据夹具

| 主体 | 角色 | 数据 |
| --- | --- | --- |
| `company-a-admin` | `COMPANY_ADMIN` | A 资料、A 案例、A 材料报价、A 人工报价、A 风格资料、A 认证材料、A 素材 |
| `company-a-editor` | `COMPANY_EDITOR` | 与 A 管理员同企业，写权限 |
| `company-a-viewer` | `COMPANY_VIEWER` | 与 A 管理员同企业，只读 |
| `company-b-admin` | `COMPANY_ADMIN` | B 资料、B 案例、B 材料报价、B 人工报价、B 素材 |
| `personal-user` | `PERSONAL_USER` | 个人收藏、项目、询价 |
| `platform-admin` | `PLATFORM_ADMIN` | 平台审核、下架、清理、审计权限，**不属于任何企业** |
| `anonymous` | 无 token | 仅可访问 6 个匿名入口 |

四类企业内角色 + 个人用户 + 平台管理员 + 匿名，共 7 个主体即可覆盖全部 81 个 operation 的授权分支。

### 8.2 隔离用例

对案例、材料报价、人工报价、素材、风格资料分别参数化执行：

1. A 列表只返回 A 数据，分页总数也只计算 A。
2. A 使用 B 的资源 ID 执行 GET/PATCH/DELETE，响应为统一 404（不得 403 泄露存在性）。
3. A 在请求 body、query、header 中伪造 B 的 `companyId/tenantId`，不能改变作用域；伪造的 `companyId` 既不生效也不应被回显。
4. A 的重复数据约束不应与 B 的同值记录冲突（自然键一律带企业维度）。
5. A 删除或修改失败后，直接从数据库核对 B 记录未变化。
6. 缓存命中、排序、筛选和分页翻页不能泄漏 B 数据。
7. 错误 message 不得包含 B 的企业名、资源标题或数据库主键以外的敏感信息。
8. `PLATFORM_ADMIN` 是**跨企业**角色：它通过 `/api/v1/admin/**` 读取任意企业数据，但在企业侧接口（`/api/v1/business/**`）上不应被当作某个企业的成员——它没有 `companyId` claim，回落后的 `subject` 不是企业 ID，因此这些调用应返回 404/403 而不是读到任意企业数据。
9. `PERSONAL_USER` 访问 `/api/v1/business/**` 的写接口 → 403；访问 `/api/v1/admin/**` → 403。
10. 同一账号同时持有 `PLATFORM_ADMIN` 与 `COMPANY_*` 时，通知等按角色分域的资源只走 `ADMIN` 域（见 13.1），企业侧数据仍按 `companyId` 归属。

企业资料需额外验证：当前企业资料接口始终绑定认证主体，不接受任意企业 ID 查询。

## 9. 权限边界矩阵

以下矩阵与 `SecurityConfiguration` + 各 `@PreAuthorize` 的**实际实现**一致，测试按此断言：

| 操作 | `COMPANY_ADMIN` | `COMPANY_EDITOR` | `COMPANY_VIEWER` | `PERSONAL_USER` | `PLATFORM_ADMIN` | 匿名 |
| --- | --- | --- | --- | --- | --- | --- |
| 读取企业资料 / 案例 / 报价 / 风格资料 | 允许 | 允许 | 允许 | 403 | 403 | 401 |
| 更新企业资料 | 允许 | 允许 | 403 | 403 | 403 | 401 |
| 新增 / 编辑案例 | 允许 | 允许 | 403 | 403 | 403 | 401 |
| 发布案例 | 允许 | 允许 | 403 | 403 | 403 | 401 |
| **删除案例** | 允许 | **403** | 403 | 403 | 403 | 401 |
| 新增 / 编辑材料与人工报价 | 允许 | 允许 | 403 | 403 | 403 | 401 |
| **删除材料与人工报价** | 允许 | **403** | 403 | 403 | 403 | 401 |
| 上传 / 删除素材 | 允许 | 允许 | 403 | 403 | 403 | 401 |
| 下载本企业素材 | 允许 | 允许 | 允许 | 403 | 403 | 401 |
| 写风格资料（PUT） | 允许 | 允许 | 403 | 403 | 403 | 401 |
| 提交企业认证（PUT `/business/certification`） | 允许 | **403** | 403 | 403 | 403 | 401 |
| 读取完备度 | 允许 | 允许 | 允许 | 403 | 403 | 401 |
| 发起询价 | 403 | 403 | 403 | 允许 | 403 | 401 |
| 企业端询价列表 | 允许 | 允许 | 允许 | 403 | 403 | 401 |
| 询价状态流转 | 允许 | 允许 | 403 | 403 | 403 | 401 |
| 通知（全部 3 个） | 允许 | 允许 | 允许 | 允许 | 允许 | 401 |
| 公开案例目录 / 公开企业页 | 403 | 403 | 403 | 允许 | 403 | 401 |
| 材料目录 | 允许 | 允许 | 允许 | 允许 | **403** | 401 |
| 预算试算 | 允许（也可匿名） | 允许 | 允许 | 允许 | 允许 | **允许** |
| 风格推荐 | 允许 | 允许 | 允许 | 允许 | 允许 | **允许** |
| 健康检查 | 允许 | 允许 | 允许 | 允许 | 允许 | **允许** |
| `/api/v1/admin/**` 全部 | 403 | 403 | 403 | 403 | 允许 | 401 |

关键易错点（必须逐条断言，不能靠推断）：

1. **删除仅限 `COMPANY_ADMIN`**：`DELETE /business/cases/{caseId}` 与报价删除都是 `hasRole('COMPANY_ADMIN')`，编辑者删除必须 403 —— 这是最常见的实现与文档不一致处。
2. **提交认证仅限 `COMPANY_ADMIN`**：`PUT /business/certification` 是 `hasRole('COMPANY_ADMIN')`，编辑者不能提交认证材料。
3. **材料目录对 `PLATFORM_ADMIN` 只读放行**：`hasAnyRole('PERSONAL_USER','COMPANY_ADMIN','COMPANY_EDITOR','COMPANY_VIEWER','PLATFORM_ADMIN')` 含平台管理员，供管理端预览（第 18 章决策 3）。只读放行不等于可写：材料报价的增删改仍然只属于企业侧，`PLATFORM_ADMIN` 只能通过 `/admin/marketplace/material-quotes/{quoteId}/visibility` 做下架/恢复。
4. **公开目录（`/cases`、`/companies`）是 `PERSONAL_USER` 专属**，企业角色一律 403 —— 企业想预览自己的公开页须走企业侧接口。
5. **`/api/v1/health` 与 `/api/v1/styles/recommendations` 完全匿名**，不带 token 也返回 200；带了无效 token 时因 `anyRequest().authenticated()` 之外的 permitAll 规则仍应 200（不得因解析失败转 401）。
6. **认证审核只有一个入口**：`POST /api/v1/admin/certifications/{companyId}/review`（`PLATFORM_ADMIN`）。旧的企业侧路径 `POST /api/v1/business/certification/{companyId}/review` 已下线（第 18 章决策 6），调用返回 404 `NOT_FOUND`，测试需断言该路径不再可用。

静态检查必须确认每个 operation 声明了 security（6 个匿名 entry 声明 `security: []`）；具体角色授权只能在集成测试验证。

## 10. 幂等与重复提交专项

### 10.1 静态检查

- **5 个创建接口显式支持幂等键**：`POST /api/v1/business/cases`、`POST /api/v1/business/material-quotes`、`POST /api/v1/business/labor-quotes`、`POST /api/v1/budgets`（归档预算）、`POST /api/v1/inquiries`。五者均要求必填 header `Idempotency-Key`，`@NotBlank @Size(min = 8, max = 128)`，缺失或长度不符 → 400 `INVALID_REQUEST`（`ServletRequestBindingException`）。
- `components.parameters.IdempotencyKey` 声明为 `in: header`、`required: true`、`minLength: 8`、`maxLength: 128`；CORS 允许头已含 `Idempotency-Key`（`SecurityConfiguration.java:69`）。
- **其余所有 POST 均不支持幂等键**：`POST /api/v1/notifications/read-all`、`POST /api/v1/admin/marketplace/companies/import`、各 upload/attach 接口、`POST /api/v1/budgets/estimate`（纯计算）。重复提交会产生新记录或重复副作用，契约必须如实声明，不得留白。
- PUT 是完整替换：`PUT /api/v1/business/profile`、`PUT /api/v1/business/style-profiles`、`PUT /api/v1/business/certification`。部分更新一律走 PATCH（案例、材料报价、人工报价、询价状态、通知已读、材料可见性）。
- DELETE 的并发控制走 query/body 中的 `version`（案例、报价），版本不匹配返回 409 `VERSION_CONFLICT` 而非静默成功。
- 创建成功返回 **201** 并带 `Location`：企业案例、材料报价、人工报价、询价（`/api/v1/business/inquiries/{id}`）、企业导入（`/api/v1/admin/marketplace/companies/import`）、**素材上传 `POST /business/assets` 与管理员代传 `POST /admin/marketplace/companies/{companyId}/assets`（返回 201、无 `Location`）**。（第 18 章决策 4：两处上传已由 200 统一为 201。）

### 10.2 幂等语义（实测实现，必须按此断言）

幂等记录落在 `business_idempotency_keys(company_id, idempotency_key, request_hash, resource_type, resource_id, created_at, expires_at)`：

1. **作用域是企业**：唯一键是 `(company_id, idempotency_key)`。企业 A 与 B 用同一个 key 互不影响，不得互相冲突。
2. **请求指纹**是请求体的 SHA-256（`objectMapper.writeValueAsBytes(request)`），即**字段顺序与空白不敏感的规范化 JSON**；同 key 但语义等价、序列化不同的 body 视为同一请求，返回同一资源。
3. **有效期 24 小时**（`expires_at = now + 86400s`），过期记录在下次同 key 调用时先被删除再重建 —— 因此过期后重放会**创建新资源**，不返回旧 ID。
4. **同 key + 同 body 重放**：插入被 `on conflict ... do nothing` 吞掉，随后读回既有记录，返回**同一 `resourceId`**，且**不重复写业务行**（`IdempotencyStore.reserve` 统一实现；`POST /budgets` 与 `POST /inquiries` 复用同一组件）。
5. **同 key + 不同 body（或不同 `resource_type`）**：抛 **409 `CONFLICT`**，错误码为 **`IDEMPOTENCY_CONFLICT`**，message「Idempotency key was used for a different request」。
6. **不同 key + 相同 body**：视为两次独立创建，落两行（这是预期行为，测试必须断言会重复创建，不能误判为缺陷）。
7. **并发同 key**：依赖数据库唯一约束，只有一个插入成功、其余读回同一 `resourceId`；并发 5–10 次的结果必须是 1 条业务记录 + 全部返回同一 ID（或全部 409，取决于 body 是否一致）。

### 10.3 集成用例清单

对 5 个支持幂等的创建接口各执行：

1. 同 key、同 body 串行重放 2 次 → 2 次响应 `data.id` 相同，数据库 1 行。
2. 同 key、同 body 并发 10 次 → 1 行，响应 ID 全一致。
3. 同 key、不同 body（仅改一个字段）→ 409 `IDEMPOTENCY_CONFLICT`，数据库仍 1 行。
4. 同 key、不同 body、不同资源类型（如先建案例再建报价）→ 409。
5. 不同 key、相同 body → 2 行，2 个不同 ID。
6. key 长度 7（< 8）或 129（> 128）→ 400 `INVALID_REQUEST`，不落库。
7. 缺失 `Idempotency-Key` 头 → 400 `INVALID_REQUEST`，不落库。
8. 企业 A、B 使用同一 key 创建 → 各自成功，互不冲突。
9. 跨越 24 小时后再重放同 key → 创建新记录（过期语义），需要可控时钟或直接改 `expires_at` 后验证。

对更新/删除接口执行相同请求重放，验证最终状态一致；带旧 `version` 的并发请求必须产生 409 而不是覆盖。

## 11. 空数据与列表行为

每个列表接口必须验证：

- 新企业无数据时返回 200，`data.items=[]`（或契约规定的空数组），分页 `total=0`。
- 超出末页返回空列表，不返回 404/500。
- 无匹配筛选结果返回空列表。
- `size=0`、负页码、超过最大 size 返回 400 —— 例外是 `GET /api/v1/admin/audit-logs`，其控制器未加约束（见 12.6）。
- 空字符串筛选值的处理与契约一致，不得触发全库/跨企业查询。

单资源空状态必须区分：

- `GET /api/v1/business/profile`：尚未创建时返回 200 + `data=null`（不是 404）。
- `GET /api/v1/business/style-profiles`：尚未保存时返回 `profiles=[]`、`version=0`、`updatedAt=null`（不是 404）。
- `GET /api/v1/business/completeness`：新企业返回全 0 / `hasPublicContact=false`（不是 404）。
- `GET /api/v1/notifications`：无通知时 `data=[]`（不是 `null`）。
- `GET /api/v1/business/inquiries`：无询价时 `data=[]`。
- `GET /api/v1/materials`、`GET /api/v1/cases`：无数据时 `items=[]` + `total=0`。
- `GET /api/v1/budgets?projectId=`：无归档时 `data=[]`。
- 不存在的案例/报价/素材 ID 才返回 404，不能使用含糊的 500。

**不分页的列表接口**（契约与实现一致，测试不得要求分页参数）：`GET /api/v1/business/inquiries`（limit 500）、`GET /api/v1/notifications`、`GET /api/v1/admin/certifications`、`GET /api/v1/styles/recommendations`、`GET /api/v1/business/style-profiles`、`GET /api/v1/budgets`。

**分页形态有两种，不能混用**：

| 形态 | 响应结构 | 使用处 |
| --- | --- | --- |
| 嵌套 `PageMeta` | `data: { items: [], page: { page, size, total, totalPages } }` | 企业案例、材料报价、人工报价、公开案例、材料目录 |
| 扁平分页 | `data: { items: [], page, size, total, totalPages }` | `GET /api/v1/admin/audit-logs`、`GET /api/v1/admin/marketplace/material-quotes` |

## 12. 管理端契约

管理端共 15 个 operation，除 `POST /api/v1/auth/admin/login` 外全部要求 `PLATFORM_ADMIN`。该角色是**平台级**角色，与企业内 `COMPANY_ADMIN` 正交：测试夹具中必须同时存在两种管理员，验证「企业管理员访问 `/api/v1/admin/**` 一律 403」。

### 12.1 管理员登录

| 检查项 | 通过标准 |
| --- | --- |
| 匿名可达 | `security: []`，无 token 也能调用；不得要求先持有普通用户 token |
| 请求体 | 复用 `LoginRequest`（`email` + `password`），与企业登录同构 |
| 非平台管理员账号 | 返回 **401 `INVALID_CREDENTIALS`**，message「管理员账号或密码不正确」；不得返回 200 + 空 token，也不得降级为 403 泄露「账号存在但角色不符」 |
| 密码错误 / 账号不存在 | 与上一行**同状态同文案**，不可区分，防止账号枚举 |
| 成功响应 | 与企业登录相同的 `AuthResponse`，`AuthUser.roles` 必须包含 `PLATFORM_ADMIN` |
| 登录失败审计 | 失败尝试不写审计日志（或写入但不含密码原文）；成功登录若写审计，`action` 需在契约枚举内 |

### 12.2 认证审核

| Operation | 权限 | 关键验收点 |
| --- | --- | --- |
| `GET /api/v1/admin/certifications` | `PLATFORM_ADMIN` | 参数 `status`（`PENDING/APPROVED/REJECTED`）、`query`、`kind`（`ALL/REAL/DEMO`）；`kind` 非法值返回 400 `INVALID_REQUEST`，message 固定「Unknown company kind filter」；**该接口不分页**，返回 `List<AdminCertification>`，不是 `Page` |
| `POST /api/v1/admin/certifications/{companyId}/review` | `PLATFORM_ADMIN` | body `CertificationDecision`：`status` 只允许 `APPROVED`/`REJECTED`（**不可设 PENDING**），`version` 必填，`reviewNote` ≤ 1000；`version` 过期 → 409 `VERSION_CONFLICT`；`companyId` 不存在 → 404 `NOT_FOUND` |
| `GET /api/v1/admin/certifications/{companyId}/documents/{assetId}` | `PLATFORM_ADMIN` | 返回二进制而非 JSON；`Content-Disposition: inline`；跨企业 `assetId` → 404，不得返回他人材料 |

审核集成用例：

1. 企业提交认证 → 列表 `status=PENDING` 可见 → 审核 `APPROVED` → 该企业报价进入 C 端材料库（见 15.3）。
2. 审核 `REJECTED` + `reviewNote` → 企业收到 `CERTIFICATION` 类型通知（见 13）。
3. 用旧 `version` 重放审核请求 → 409，且数据库状态与首次审核一致。
4. `demo=true` 的种子企业必须能被 `kind=DEMO` / `kind=REAL` 正确切分，且在响应中带 `demo` 标记。
5. 认证未通过时，`GET /api/v1/admin/certifications/{companyId}/documents/{assetId}` 仍应对平台管理员可读（审核需要），但对任何企业角色 403。

### 12.3 企业导入与代录

| Operation | 状态码 | 验收点 |
| --- | --- | --- |
| `POST /api/v1/admin/marketplace/companies/import` | **201** | body `CompanyImportRequest`；`serviceAreas` ≤ 20、`cases` ≤ 30、`materials` ≤ 50，三者均必填（可为空数组，不可缺省）；`email` 重复 → 409 `CONFLICT`；返回 `ImportResult` 含 `companyId`/`certificationStatus`/`caseDrafts`/`quotes`/`firstCaseId`/`firstQuoteId` |
| `POST /api/v1/admin/marketplace/companies/{companyId}/assets` | **200（非 201）** | multipart 单文件；413 `FILE_TOO_LARGE`（message「单个文件不能超过 15 MB」）、415 `UNSUPPORTED_MEDIA_TYPE`；mediaType 白名单 `image/jpeg,image/png,image/webp,image/gif,image/bmp,application/pdf` |
| `POST /api/v1/admin/marketplace/companies/{companyId}/cases/{caseId}/files` | 200 | body `CaseFilesRequest.fileIds` ≤ 30；**data 恒为 `null`**；`caseId` 不属于 `companyId` → 404 |
| `POST /api/v1/admin/marketplace/companies/{companyId}/material-quotes/{quoteId}/images` | 200 | body `MaterialImagesRequest.imageIds` ≤ 8；**data 恒为 `null`**；超 8 个 → 400 `VALIDATION_ERROR` |
| `GET /api/v1/admin/marketplace/companies/{companyId}` | 200 | 返回聚合 `AdminCompanyDetail`：`certification`/`profile`/`styleProfile` 可为 `null`，`cases`/`materialQuotes`/`laborQuotes`/`assets` 恒为数组（未录入时 `[]`，不返回 `null`） |
| `GET .../assets/{assetId}` | 200 | 二进制 inline |

导入用例必须覆盖：

- 导入企业后**默认认证状态**与「是否直接进入材料库」的关系需与 15.3 联动验证；`caseDrafts` 应等于实际创建的草稿案例数，且这些案例默认 `status=draft`、不进入公开案例目录。
- 导入体中的 `materials` 逐条校验 `price >= 0.01`、`validUntil` 为 `date`；任一条非法时整笔事务回滚，不得留下半个企业。
- 同一 `email` 二次导入 → 409，且首次导入的企业、账号、案例、报价均不被修改。
- `companyId` 为不存在 UUID → 404；非 UUID 路径 → 400 `INVALID_REQUEST`。

### 12.4 材料可见性与下架

| 检查项 | 通过标准 |
| --- | --- |
| `GET /api/v1/admin/marketplace/material-quotes` | 参数 `query`、`visibility=ALL/PUBLISHED/HIDDEN/EXPIRED`、`page`（≥1）、`size`（1–100，默认 20）；`visibility` 非法 → 400 `INVALID_REQUEST`，message 固定「Unknown material visibility filter」；返回扁平 `Page`：`items/page/size/total/totalPages` |
| `PATCH /api/v1/admin/marketplace/material-quotes/{quoteId}/visibility` | body `MaterialVisibilityRequest`：`hidden` 必填，`reason` ≤ 500；`reason` 超长 → 400，message 固定「Reason must be 500 characters or fewer」 |
| 下架生效 | `hidden=true` 后**立即**从 `GET /api/v1/materials` 消失（同进程内无缓存延迟）；`GET /api/v1/business/assets/public/materials/{quoteId}/images/{imageId}` 对该报价图片也应 404 |
| 下架可逆 | `hidden=false` 后重新出现；`hiddenReason` 在响应的 `hidden` 为 `false` 时是否保留需与契约一致（当前实现保留原值） |
| 隔离 | 平台管理员下架 A 企业报价，B 企业同值报价不受影响 |

### 12.5 未关联素材清理

| 检查项 | 通过标准 |
| --- | --- |
| `GET /api/v1/admin/assets/cleanup-preview` | 返回 `eligibleImageCount`/`estimatedBytes`/`cutoffAt`/`generatedAt`/`candidates`/`remainingImageCount`；`cutoffAt` 必须约为「当前时间 − 7 天」 |
| 候选资格 | 仅 `media_type` 以 `image/` 开头、`created_at` 早于 cutoff、且**未被案例/报价/资料引用**的素材进入 `candidates`；PDF 与非图片素材永不进入 |
| `POST /api/v1/admin/assets/cleanup` | body `CleanupRequest.assetIds`；**`null`、空数组、超过批次上限均**静默返回 `removedImageCount=0` 而非 400 —— 这是当前实现的既定行为，契约与测试必须按此断言 |
| 删除原子性 | `removedImageCount>0` 时写审计：`action=IMAGE_CLEANUP`、`targetType=BUSINESS_ASSET`、描述「手动清理未关联图片，共删除 N 张」 |
| 误删防护 | 预览后被重新引用的素材，正式清理时必须跳过；不存在/非图片/未过期的 `assetId` 必须被忽略而不是导致整批失败 |
| `GET /api/v1/admin/assets/cleanup-preview/{assetId}/image` | 二进制 inline；对不符合候选资格的素材返回 404，避免变成任意素材读取后门 |

### 12.6 审计日志

| 检查项 | 通过标准 |
| --- | --- |
| `GET /api/v1/admin/audit-logs` | 参数 `page`（默认 1）、`size`（默认 20）、`action`（可选精确筛选）；返回**扁平分页** `AuditEntry[] + page/size/total/totalPages`（不是嵌套 `page` 对象） |
| 条目字段 | `id`/`actorId`/`actorEmail`/`action`/`targetType`/`targetId`/`description`/`createdAt` 全部只读 |
| 排序 | 必须按时间倒序稳定排序，翻页结果不重不漏 |
| 覆盖动作 | 认证审核、材料下架、素材清理至少各产生 1 条；`action` 取值需在契约枚举内（`IMAGE_CLEANUP`、`CERTIFICATION_REVIEW` 等） |
| 越权 | 任何非 `PLATFORM_ADMIN`（含 `COMPANY_ADMIN`）→ 403；未认证 → 401 |

**已知契约与实现落差（必须在本阶段内解决）**：`AdminAuditController` 的 `page`/`size` 未加 `@Min`/`@Max` 也未使用 `@Validated`，因此 `page=0`、`size=-1`、`size=10000` 不会被后端拒绝；而契约把 `page`/`size` 声明为 `minimum: 1`、`size: 1–100`。二者择一：给控制器补校验注解，或放宽契约。测试在决策落地前按「契约更严」断言，并在评审中标注该差异。

## 13. 通知契约

通知是**只读 + 已读标记**的派生资源，不对应可写实体；3 个 operation 对所有已登录角色开放（`PERSONAL_USER, COMPANY_ADMIN, COMPANY_EDITOR, COMPANY_VIEWER, PLATFORM_ADMIN`）。

### 13.1 收件人分域

通知按「主体 + 收件人角色」二维隔离，角色的映射规则必须固化为测试断言：

| token 中的 roles | 收件人域 |
| --- | --- |
| 含 `PLATFORM_ADMIN` | `ADMIN` |
| 无 `PLATFORM_ADMIN`，但任一项以 `COMPANY_` 开头 | `BUSINESS` |
| 其余（个人用户） | `PERSONAL` |

- 同一账号同时持有 `PLATFORM_ADMIN` 与 `PERSONAL_USER` 时，只按 `ADMIN` 域取通知，**不合并**三类通知。
- 租户隔离：企业 A 的 `BUSINESS` 通知不得出现在企业 B；同一企业内 `COMPANY_ADMIN` 收到的通知是否对 `COMPANY_VIEWER` 可见，需在契约中唯一确定（当前实现按 `companyId` 域共享，视图角色也已读状态共享，因此「A 把通知标为已读，B 也变成已读」是预期行为）。

### 13.2 接口验收

| Operation | 验收点 |
| --- | --- |
| `GET /api/v1/notifications` | 返回 `data` 为数组（**不分页**）；元素字段 `key`/`type`/`title`/`message`/`link`/`createdAt`/`read`；`type` ∈ `CERTIFICATION/QUOTE_EXPIRING/INQUIRY/ADMIN_REVIEW`；无通知时 `data=[]`（不是 `null`） |
| `PATCH /api/v1/notifications/{key}/read` | `key` 为字符串且 ≤ 255；**data 恒为 `null`**；重复标记已读仍是 200（幂等）；不存在或不属于当前域的 `key` 也返回 200 而不是 404 —— 契约据此声明只有 200/401，无 404 |
| `POST /api/v1/notifications/read-all` | **data 恒为 `null`**；只影响当前主体当前域；无未读时仍 200 |

### 13.3 事件链路（集成）

1. 企业提交认证 → 平台管理员 `ADMIN` 域出现 `CERTIFICATION` 通知。
2. 管理员审核通过/驳回 → 对应企业 `BUSINESS` 域出现 `CERTIFICATION` 通知，且 `link` 指向企业端页面路径。
3. 个人用户发起询价 → 被询企业 `BUSINESS` 域出现 `INQUIRY` 通知。
4. 材料报价临近 `validUntil` → 对应企业出现 `QUOTE_EXPIRING` 通知，同一报价不得每日重复堆叠（去重键必须写入契约）。
5. 上述每条通知的 `link` 都必须是站内相对路径，不得包含外部域名或 `javascript:` 前缀。

## 14. 询价契约

询价是 C 端个人用户与 B 端企业之间唯一的写链路，跨两个角色的权限与状态机必须分别验收。

### 14.1 创建（个人端）

| 检查项 | 通过标准 |
| --- | --- |
| 权限 | 仅 `PERSONAL_USER`；企业任意角色 → 403；未认证 → 401 |
| 成功码 | **201**，且 `Location: /api/v1/business/inquiries/{id}`；body 为 `CompanyInquiry` |
| 请求体 | `materialId` 必填 UUID；`contactName` ≤ 120、`contactInfo` ≤ 160、`message` ≤ 2000，三者 `@NotBlank`（trim 后非空） |
| 可咨询前置条件 | 目标报价必须同时满足：`company_certifications.status='APPROVED'`、`admin_hidden=false`、`valid_until >= 当前日期`；否则 **404 `NOT_FOUND`**，message「材料当前不可咨询」 |
| 材料不存在 | 与上一行同状态同文案，不区分「不存在」与「不可咨询」，避免探测未认证企业 |
| 幂等 | 已要求 `Idempotency-Key`（第 18 章决策 5）：同 key 同 body 返回同一询价，同 key 换 body 409 `IDEMPOTENCY_CONFLICT`；前端提交按钮仍需防双击 |

### 14.2 企业端列表与流转

| Operation | 权限 | 验收点 |
| --- | --- | --- |
| `GET /api/v1/business/inquiries?status=` | `COMPANY_ADMIN`/`COMPANY_EDITOR`/`COMPANY_VIEWER` | 参数 `status` 可选，取值 `NEW/CONTACTED/QUOTED/CLOSED`，非法枚举 → 400 `INVALID_REQUEST`；**不分页**，服务端 `order by created_at desc, id limit 500`；企业归属取自 token 的 `companyId` claim，缺省回落到 `subject` |
| `PATCH /api/v1/business/inquiries/{inquiryId}/status` | `COMPANY_ADMIN`/`COMPANY_EDITOR` | body `UpdateInquiryStatusRequest`：`status` 必填、`version` 必填整数 |

状态流转验收：

1. `version` 与当前记录不符 → **409 `VERSION_CONFLICT`**，message「咨询记录已更新，请刷新后重试」，且不覆盖新状态。
2. `inquiryId` 不存在或属于其他企业 → **404 `NOT_FOUND`**，message「咨询记录不存在」；不得用 403 泄露存在性。
3. 只读角色 `COMPANY_VIEWER` 调用 PATCH → 403，且数据库无变化。
4. 合法流转 `NEW → CONTACTED → QUOTED → CLOSED` 逐级验证，每次成功后 `version` 递增、`updatedAt` 单调增加。
5. **状态机有硬约束**（第 18 章决策 2）：只允许 `NEW → CONTACTED`、`CONTACTED → QUOTED`、`QUOTED → CLOSED`、`CLOSED →`（无后继）。跳步（`NEW` 直接 `QUOTED`）、回退（`QUOTED` 回到 `NEW`）、同态重设（`NEW → NEW`）一律 **409 `INVALID_STATUS_TRANSITION`**，message「咨询状态只能按 NEW → CONTACTED → QUOTED → CLOSED 顺序推进，当前为 X」，且状态不变。`version` 校验先于流转校验，两者都错时先报 `VERSION_CONFLICT`。
6. 列表按 `status` 筛选后仍保持企业隔离；跨企业的 `inquiryId` 不出现在列表中。

### 14.3 端到端链路

个人用户浏览材料目录（15.3）→ 选中已认证企业报价 → 发起询价 → 企业端列表出现 `NEW` → 企业标记 `CONTACTED` / `QUOTED` → 关闭为 `CLOSED`。全流程中企业不得看到发起者的密码、token 或其它订单信息；个人端不得看到企业内部备注。

## 15. 公开目录契约

公开目录包含「面向 C 端的只读消费接口」与「匿名入口」两类，共同特征是**不写业务数据**，但**读取范围受认证状态与企业审核状态约束**。

### 15.1 公开案例目录

| 检查项 | 通过标准 |
| --- | --- |
| 权限 | `GET /api/v1/cases` 与 `GET /api/v1/cases/{caseId}/files/{fileId}` 均要求 `PERSONAL_USER`；企业角色 → 403；未认证 → 401（**不是 200 + 空列表**） |
| 参数 | `query` ≤ 120、`style` ≤ 80、`city` ≤ 80、`minArea`/`maxArea`/`minBudget`/`maxBudget` ≥ 0、`page` ≥ 1、`size` 1–100（**默认 24**） |
| 响应 | `Page`：`items[]` + `page{page,size,total,totalPages}`；`items` 元素为 `PublicCase`（11 字段：`id`/`title`/`area`/`style`/`budget`/`companyId`/`companyName`/`city`/`services`/`files`/`updatedAt`）—— **无 `status` 字段**，不得因客户端期待而添加 |
| 只列已发布 | `status=draft` 的案例、未通过认证企业的案例一律不出现；`files` 只含该案例真实关联的素材 |
| 越权素材 | 跨案例的 `fileId` → 404；不得通过遍历 `fileId` 读取他人未发布案例的图片 |
| 二进制响应头 | `Content-Disposition: inline`、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff` 三者必须同时存在 |
| 空与边界 | 无数据返回 200 + `items=[]`、`total=0`；超出末页返回空列表不返回 404；`size=0`/负页码 → 400 |

### 15.2 公开企业页

| 检查项 | 通过标准 |
| --- | --- |
| 权限 | `GET /api/v1/companies/{companyId}` 与 `/assets/{assetId}` 均要求 `PERSONAL_USER` |
| 字段 | `PublicCompany`：`companyId`/`name`/`city`/`services`/`intro`/`serviceAreas`/`businessHours`/`publicContactName`/`publicContactInfo`/`logoAssetId`/`storefrontAssetId`/`caseCount`/`materialCount`/`certificationStatus`/`updatedAt` |
| 敏感字段 | **不得**出现内部注册名、账号邮箱、审核备注、内部 ID、`adminHidden` 等字段 |
| 计数一致性 | `caseCount` 只计已发布案例，`materialCount` 只计公开可见报价；下架一条材料后 `materialCount` 立即减 1 |
| 未认证企业 | `certificationStatus` 暴露为 `PENDING`/`REJECTED` 时，页面数据是否可读需在契约中唯一确定（当前允许读，但材料与案例列表为空） |
| 素材 | `logoAssetId`/`storefrontAssetId` 必须能通过 `/companies/{companyId}/assets/{assetId}` 取回；跨企业 `assetId` → 404；响应头同 15.1 |

### 15.3 材料目录

| 检查项 | 通过标准 |
| --- | --- |
| 权限 | `PERSONAL_USER` 与全部 `COMPANY_*` 可读；**未认证 → 401**；`PLATFORM_ADMIN` 不在允许集内，按契约返回 403 |
| 参数 | `region` ≤ 80、`category` ≤ 80、`query` ≤ 120、`includeExpired`（默认 `false`）、`page` ≥ 1、`size` 1–100（默认 20）、`sort` ≤ 40（默认 `updatedAt`） |
| 数据来源约束 | 只返回「企业认证 `APPROVED` + 报价未 `adminHidden` + 未过期」的记录；未认证企业报价**绝不出现** |
| 过期控制 | 默认隐藏 `valid_until < 当天` 的报价；`includeExpired=true` 才返回，且响应中 `validUntil` 原样保留 |
| 字段 | `CatalogMaterial` 含 `companyContactName`/`companyContactInfo`（供咨询用）、`imageId`（≡ `imageIds[0]`）、`imageIds`（≤ 8）、`unitKind`（`UnitKind` 枚举 14 值）、`unitUnknown`、`itemNature`（`INCLUDED/GIFT/OWNER_SUPPLIED`） |
| 单位语义 | `unitUnknown=true` 的报价必须仍然可读，但契约与前端不得把它计入预算计算；`unitKind` 不得回退为任意字符串 |
| 隔离 | 企业 A 的草稿报价、未过审报价、已下架报价均不出现在 B 企业或 C 端结果里 |
| 下架时效 | 管理员 `PATCH .../visibility {hidden:true}` 后，同一次请求返回即可见的下一次 GET 必须消失（见 12.4） |

### 15.4 风格推荐（匿名）

| 检查项 | 通过标准 |
| --- | --- |
| 匿名可达 | `security: []`，无 token 返回 200；不得因缺少 `companyId` 而 500 |
| 响应 | `List<RecommendationProfile>`，字段 `style`/`name`/`note`/`reason`/`minBudgetWan`/`maxBudgetWan`/`regions`/`priority`/`companyId`/`companyName` |
| 单位 | 预算单位为**万元**，`minBudgetWan` 必填 ≥ 0（1 位小数），`maxBudgetWan` 为空表示无上限 |
| 来源标记 | 每条推荐必须带可展示的企业来源（`companyId`+`companyName`），供预算页标注 |
| 未配置企业 | 企业未维护风格资料时该企业不贡献推荐项；全站无配置时返回 `[]` 而非 404/500 |

### 15.5 预算试算与归档

| Operation | 权限 | 验收点 |
| --- | --- | --- |
| `POST /api/v1/budgets/estimate` | **匿名**（`security: []`） | `area` 必填且 1–2000；`finishLevel` ∈ `BASIC/STANDARD/PREMIUM`（缺省 `STANDARD`）、`spaceType` ≤ 40（缺省 `WHOLE_HOME`）；返回 `BudgetEstimateResult` |
| `POST /api/v1/budgets` | 已认证 | **201**；归档主体为 token 的 `companyId`，缺省回落 `subject`；要求 `Idempotency-Key`（8–128 字符），同键同体重放返回同一条归档，同键异体 409 `IDEMPOTENCY_CONFLICT`（见第 18 章决策 5） |
| `GET /api/v1/budgets?projectId=` | 已认证 | 只返回当前主体归档；`projectId` 筛选不得跨主体 |
| `GET /api/v1/budgets/{id}` | 已认证 | 他人 `id` → 404 |
| `DELETE /api/v1/budgets/{id}` | 已认证 | **204**；他人 `id` → 404；重复删除的语义固定为 404（不随机变化） |
| `GET /api/v1/health` | **匿名** | 200，`data.status` 为 `UP`/`DOWN` 等稳定取值，**有 `data` 包装**（不是裸对象） |

试算结果语义：

- `pricingMode` 恒为 `LIST`、`modelVersion` 恒为 `v4`，前端据此判断算法版本，不得为空。v4 起材料与人工分两路计价，同为 `PARTIAL` 的输入在 v3 下会被整项回退、总额不同，因此版本号必须能区分。
- `dataQuality`：任一板块 `source=PARTIAL` 即为 `PARTIAL`（即使其余板块全是 `QUOTED`）；`items` 中无任何 `QUOTED`/`PARTIAL` 来源 → `REFERENCE`；全部 `QUOTED` → `QUOTED`。三类各需一条夹具。
- `overBudgetStatus`：`targetBudget < totalLow` → `OVER`；`targetBudget > totalHigh` → `UNDER`；落在闭区间 → `WITHIN`；未提供 `targetBudget` 时的取值需与契约一致。
- `items[].source` ∈ `QUOTED/PARTIAL/REFERENCE/DISABLED`；`disabled=true` 的项不计入合计，且 `skippedReasons` 非空。
- `unitUnknown=true` 的报价不得进入任一 `items[].quoteSamples`，防止错误单位参与计算。

材料/人工分离计价（阶段 2a-3）：

- 每个 `items[]` 必须满足 `materialCostLow + laborCostLow = costLow`（`costHigh` 同理），浮点比较留 0.01 容差。这是 2a-3 的核心不变量，任何一路缺报价都不许破坏它。
- `items[].materialSource` / `laborSource` ∈ `QUOTED/REFERENCE/NONE`，两路**独立**判定 3 家企业门槛：材料报价够 3 家而人工不够时，`materialSource=QUOTED`、`laborSource=REFERENCE`、`source=PARTIAL`，**人工成本必须非 0**（走基准占比回填），不得整项跌回 `REFERENCE`。
- `materialPriceLow/High`、`laborPriceLow/High` 是「元/计量单位」的展示单价，由成本字段反推，允许与成本 ÷ 数量 ÷ 损耗有 1 分钱级取整差；**成本字段才是权威值**，消费者不得用单价去反算总额。
- 保序性：只调整材料报价价格，`laborCostLow/High`、`laborPriceLow/High` 必须逐位不变（验收第 2 条）。
- 匿名试算不得落库；只有显式 `POST /api/v1/budgets` 才产生归档记录。

## 16. 执行分层与建议工具

### 16.1 第一阶段：静态契约门禁

在 `contracts/openapi.yaml` 可用后执行：

- OpenAPI parser / Spectral lint。
- 自定义规则检查统一响应信封、security、只读企业归属字段、错误状态覆盖。
- schema 示例校验：所有 example 必须通过对应 schema。
- OpenAPI diff：破坏性字段删除、类型变化、required 增加必须阻断合并。

静态门禁不需要后端或数据库，应在契约合并前完成。

### 16.2 第二阶段：控制器契约测试

后端 DTO/Controller 实现后，使用 Spring MockMvc：

- 从请求边界验证 JSON 类型、required、长度、枚举、金额和日期。
- 验证 HTTP 状态、统一信封和稳定错误码。
- mock 应用服务，确认校验失败不会调用写服务。

该阶段可不连接 PostgreSQL，但不能证明企业数据隔离。

### 16.3 第三阶段：PostgreSQL 集成测试

建议使用 Testcontainers PostgreSQL + Flyway，覆盖：

- 真实数据库约束与 DTO 规则一致。
- 企业 A/B 数据隔离和跨企业 ID 攻击。
- 唯一约束、幂等 key、事务回滚和并发更新。
- 空数据、分页、筛选、排序和过期报价。

### 16.4 第四阶段：端到端消费者契约

前端切换 API adapter 后验证：

- 空列表、校验错误、403、404、409、500 均有可理解状态。
- 金额/日期类型与前端展示一致。
- 企业案例、报价新增/编辑/删除后页面与 API 状态一致。
- 消费端材料库不展示其他企业草稿或过期报价。

## 17. 契约验收通过标准

静态门禁（契约合并前必须全绿）：

1. OpenAPI 可解析，无悬空 `$ref`（当前基线：81 operation / 120 schema / 11 共享 response / 541 ref / 0 dangling）。
2. 每个 operationId 唯一且命名稳定；19 个 tag 全部在文件头声明。
3. 6 个匿名入口显式声明 `security: []`，其余 operation 继承全局 `bearerAuth`。
4. `ErrorResponse.code` 覆盖 `INVALID_REQUEST/VALIDATION_ERROR/UNAUTHORIZED/FORBIDDEN/NOT_FOUND/CONFLICT/IDEMPOTENCY_CONFLICT/VERSION_CONFLICT/INVALID_STATUS_TRANSITION/DUPLICATE_QUOTE/UNSUPPORTED_MEDIA_TYPE/FILE_TOO_LARGE/INTERNAL_ERROR`。
5. 每个 operation 至少声明 1 个 2xx 与对应 4xx；2xx/4xx 均带 schema。
6. 上传类接口声明 `multipart/form-data` 与 `type: string, format: binary`，并引用 413/415。
7. 金额使用数值 schema（`multipleOf: 0.01`），日期使用 `date`，时间戳使用 `date-time`。

集成门禁：

8. 第 9 章权限矩阵逐格通过，尤其是「删除仅 `COMPANY_ADMIN`」「认证提交仅 `COMPANY_ADMIN`」「材料目录对 `PLATFORM_ADMIN` 只读放行、写操作仍拒绝」三条易错项。
9. 第 8 章企业隔离用例全部通过，跨企业访问统一 404。
10. 第 10 章幂等用例全部通过（5 个接口 × 9 条：案例、材料报价、人工报价、预算归档、询价）。
11. 第 13 章通知分域与第 14 章询价状态机通过。
12. 第 15 章公开目录的「未认证企业报价不出现」「下架立即生效」两条通过。

发布门禁：上述全部通过，且不存在跨企业读写、重复创建、未认证数据泄漏三类高风险缺陷。

## 18. 遗留决策（已全部定稿）

第 18 章原有的 10 条遗留决策已由产品逐条选定方案并落地到代码、契约与测试，本章从「待确认清单」改为**已定决策的断言清单**。测试与契约按此表执行，不再标注待确认。

| # | 决策 | 选定方案 | 落地位置 |
| --- | --- | --- | --- |
| 1 | 审计日志分页 | **收紧实现**：`page ≥ 1`、`size 1–100`，越界 400 `VALIDATION_ERROR` | `AdminAuditController` 类级 `@Validated` + `@Min`/`@Max` |
| 2 | 询价状态机 | **补合法流转**：只能 `NEW → CONTACTED → QUOTED → CLOSED`，跳步/回退/同态重设一律 409 `INVALID_STATUS_TRANSITION` | `InquiryService.updateStatus` + `allowedNext` |
| 3 | 材料目录权限 | **放开只读预览**：`PLATFORM_ADMIN` 可读，仍无写权限 | `MaterialCatalogController` 的 `@PreAuthorize` |
| 4 | 素材上传状态码 | **统一 201**：`POST /business/assets` 与管理员代传接口均返回 201 + `Location` | `BusinessAssetController`、`AdminMarketplaceController` |
| 5 | 幂等键覆盖 | **补齐**：`POST /budgets` 与 `POST /inquiries` 同样要求 `Idempotency-Key`（8–128 字符），与案例/报价共用 `IdempotencyStore` | `BudgetController`、`InquiryController` |
| 6 | 认证审核入口 | **下线旧路径**：仅保留 `POST /api/v1/admin/certifications/{companyId}/review` | `CertificationController` 删除 `/business/certification/{companyId}/review` |
| 7 | 通知已读 | **按用户独立**：同企业下每个账号各自维护已读，沿用 `notification_reads` 主键 `(recipient_id, recipient_role, notification_key)` | `NotificationService`/`NotificationController`（实现已符合，补断言） |
| 8 | `unitUnknown` 报价 | **可见但不可比价**：列表与详情照常返回，客户端统一标注「单位待确认，不参与比价」，预算聚合跳过 | 契约 `unitUnknown.description`；`src/services/budgetUnits.ts` 的 `unitUnknownBadge`；企业端与材料库 |
| 9 | 材料报价自然键 | **补唯一约束**：企业维度 `lower(btrim(name), btrim(specification), coalesce(brand,''), btrim(unit))` 唯一，冲突 409 `DUPLICATE_QUOTE` | `V22__enforce_material_quote_natural_key.sql`、`BusinessDataService` |
| 10 | 案例创建状态 | **禁止创建即发布**：`CaseRequest.status` 只接受空值（`@Null`），发布必须走 `POST /cases/{caseId}/publish` | `BusinessDtos.CaseRequest`、`BusinessDataService.createCase` |

新增测试断言（第 17 章门禁的补充）：

13. 决策 1：`GET /admin/audit-logs?page=0` 与 `size=101` 均 400 `VALIDATION_ERROR`。
14. 决策 2：跳过 `CONTACTED` 直接置 `QUOTED`、或从 `QUOTED` 回退到 `NEW`，均 409 `INVALID_STATUS_TRANSITION`；示例文案「咨询状态只能按 NEW → CONTACTED → QUOTED → CLOSED 顺序推进，当前为 X」。
15. 决策 4：两个上传接口的成功断言为 201（不再是 200）。
16. 决策 5：缺 `Idempotency-Key` 头时 400；同 key 同 body 重放返回同一资源；同 key 换 body 返回 409 `IDEMPOTENCY_CONFLICT`。
17. 决策 6：`POST /api/v1/business/certification/{companyId}/review` 返回 404（契约中已删除该路径，operation 总数由 82 降为 81）。
18. 决策 9：同企业重复自然键（忽略大小写与首尾空格）409 `DUPLICATE_QUOTE`；换单位可创建；`PATCH` 撞键同样 409。批量导入违反时跳过重复行而不是整批失败。
19. 决策 10：`POST /cases` 带 `"status":"published"` 返回 400 `VALIDATION_ERROR`。

决策 8 的展示口径（前端与契约须一致）：

- 报价本身**照常出现在**材料目录、企业报价列表与详情页，不隐藏。
- 文案固定为「单位待确认，不参与比价」，企业端另加 `⚠` 前缀提示录入者修正。
- 预算估算与比价组件跳过该报价；同时该条不显示「N 天后到期」这类时效提示，只显示单位提示。

已由实现闭合、无需再决策的历史阻塞项（保留备查）：

- 企业身份与权限：JWT + `roles` claim + `companyId` claim，角色为 `PERSONAL_USER`/`COMPANY_ADMIN`/`COMPANY_EDITOR`/`COMPANY_VIEWER`/`PLATFORM_ADMIN`/`AI_WORKER`。
- 企业资料首次 GET：200 + `data=null`。
- 跨企业资源：统一 404。
- 幂等键：5 个创建接口支持（案例、材料报价、人工报价、预算归档、询价），作用域为企业、SHA-256 指纹、24 小时有效期。
- 乐观锁：`version` 字段 + 409 `VERSION_CONFLICT`。
- 金额类型：数值 + `multipleOf 0.01`；日期 `validUntil` 为 `date`，且限定「今天至未来 10 年内」。
