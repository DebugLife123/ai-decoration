# 预算建模方案（阶段 2a）

> ⚠️ **本文是 v1 草稿，部分结论已被实表校准推翻。**
> 现行版本请看 [BUDGET_SECTIONS.md](BUDGET_SECTIONS.md)（板块结构）与 [ROADMAP.md](ROADMAP.md) §阶段 2a（实施拆解）。
>
> 已被推翻的要点：6 个分项 → **9 个板块**；管理费 12% → **10%**；综合单价 → **材料/人工分两路**；
> 单位 6 类 → **11 类**；只支持清单式 → **增加套餐式**；损耗率 10~12% → **5%/8%/10%**。
> 仍然有效的部分：三层降级（QUOTED/PARTIAL/REFERENCE）、P25/P75、报价匹配 6 步过滤、3 家企业门槛。
>
> ---
>
> 目标：把「按面积拍一个参考区间」升级成「按真实企业报价算出的分项预算」，
> 并且在**数据不足时也能给出可解释的结果**。
>
> 对应 ROADMAP 阶段 2a。本文只讲建模，不讲 UI。

---

## 0. 先说结论

预算建模的本质不是「加法」，是**三层降级**：

```
真实报价够用  → 用真实报价算            （QUOTED）
真实报价不足  → 基准占比回填缺的项       （PARTIAL）
完全没有报价  → 全部退回行业基准         （REFERENCE）
```

**能不能把模型做对，取决于第二层写得好不好**，因为现在的真实数据只有 6 条材料报价、1 条人工报价（见 §1）。
如果只做第一层，产品在补数据之前一直是空白；如果只做第三层，那和现在前端写死的常量没区别。

---

## 1. 现在为什么算不出来

### 1.1 真实数据现状（2026-11-07 实测 `decoration` 库）

**材料报价 6 条**

| name | specification | unit | price | category | region | 归属企业 |
|---|---|---|---|---|---|---|
| 浅灰岩板台面 | 1200×600×6mm | ㎡ | 628.00 | 厨房 | 广州 | 木棉整装 |
| 原木复合地板 | 910×127×15mm | ㎡ | 299.00 | 地板 | 上海 | 筑境设计事务所 |
| 木地板 | 910x10x10 | **mm** | 299.00 | 地板 | 衡阳 | 测试企业1 |
| 浅橡木复合地板 | 910×127×15mm | ㎡ | 268.00 | 地板 | 上海 | 栖居美学设计 |
| 墙纸 | 111 | **mm** | 399.00 | 墙壁 | 衡阳 | 测试企业1 |
| 暖白艺术涂料 | 哑光内墙漆 20kg | 桶 | 398.00 | 涂料 | 杭州 | 拾光空间设计 |

**人工报价 1 条**：`瓦匠工 | 工日 | 200.00 | 衡阳`

### 1.2 三个硬缺口

**缺口 A：`unit` 不是计量单位，是自由文本**

```
category=地板, unit=㎡    → 299 元/㎡     ✅ 可算
category=地板, unit=mm    → 299 元/mm     ❌ 应为「元/㎡」，mm 是规格单位误填
category=墙壁, unit=mm    → 399 元/mm     ❌ 同上
category=涂料, unit=桶    → 398 元/桶     ⚠️ 可算，但需知道 1 桶涂多少㎡
```

6 条里有 **2 条单位不可用（33%）**。如果不做枚举化，这两条会直接被当成「每毫米 299 元」参与计算，把结果放大 1000 倍。

**缺口 B：`category` 是自由中文，不构成分项体系**

现在只有 5 个类目：`地板 / 墙壁 / 厨房 / 涂料`。而一个真实预算是 6~8 个分项：
拆改水电、泥瓦防水、墙顶面、地面、厨卫定制、安装管理。

「拆改与水电」「泥瓦与防水」「安装辅料」这三项**一条报价都没有**，但它们占总造价的 40% 以上。
所以必须有**占比回填**，否则只能算出半个预算。

**缺口 C：`labor_quotes` 没有 `admin_hidden`**

`material_quotes` 有 `admin_hidden boolean default false` + `admin_hidden_reason`（V14 加的），
`labor_quotes` 没有。材料被下架后，对应的人工报价仍会参与计算 —— 语义不一致。

### 1.3 一个商业风险（不是技术问题，但会影响建模）

现在地板类目有 2 条同城（上海）报价：268 和 299，来自**两家**企业。
如果只有一家企业报了价，那这家企业的价格就变成了「平台指导价」——
对其他企业不公平，对消费者是误导，对平台是合规风险。

**所以：单价聚合必须有「最少企业数」门槛，不满足就降级。** 见 §5.2。

---

## 2. 模型骨架

### 2.1 一条主线公式

```
分项造价 = 工程量 × 单价 × (1 + 损耗率) + 该分项人工费
总造价   = Σ 分项造价 × (1 + 管理费率)
```

每一层的区间来源：

| 量 | 低值来源 | 高值来源 |
|---|---|---|
| 工程量 | 基准工程量 × 0.92 | 基准工程量 × 1.08 |
| 单价 | 匹配报价的 P25 | 匹配报价的 P75 |
| 损耗率 | 定值（按分项） | 同左 |
| 管理费率 | 定值区间 | 同左 |

**为什么用 P25/P75 而不是 min/max**：样本少的时候 min/max 会被单条异常值带走。
现在的数据里就有异常值（`墙纸 399 元/mm`），min/max 会直接把它当成上限。

### 2.2 工程量怎么从「面积」推出来

用户只输入建筑面积（`projects.area`）。要推出各分项工程量，需要三个中间量：

```
套内面积 = 建筑面积 × 得房率           (默认 0.78，高层 0.75，多层 0.82)
墙面面积 = 套内面积 × 2.35 ~ 2.75      (周长 × 层高的经验系数)
顶面面积 = 套内面积
```

然后每个分项用 `per_sqm` 系数乘上去（详见 §3.2 `workload_factors`）。

### 2.3 六个分项及其计量基准

| 分项 key | 显示名 | 材料类目 | 人工 | 用量基准 | per_sqm |
|---|---|---|---|---|---|
| `DEMOLITION` | 拆改与水电 | —（无报价） | 水电工 | 套内面积 | 0.45 工日/㎡ |
| `MASONRY` | 泥瓦与防水 | 瓷砖 / 防水 | 瓦匠工 | 套内面积 | 0.35 工日/㎡ |
| `WALL` | 墙顶面与涂装 | 涂料 / 墙壁 | 油漆工 | 墙面面积 | 0.06 工日/㎡ |
| `GROUND` | 地面铺装 | 地板 / 瓷砖 | 铺装工 | 套内面积 | 0.72 ㎡/㎡ |
| `KITCHEN` | 厨卫与定制 | 厨房 / 卫浴 | — | 套内面积 | 0.06 ㎡/㎡ |
| `OVERHEAD` | 安装辅料与管理 | — | — | 总价百分比 | 12% |

> 这些系数是**行业经验初值**，不是权威数据。落地后要用企业真实报价反推校准（见 §6.3）。

---

## 3. 数据模型

### 3.1 单位枚举化

```sql
-- 五类计量单位，覆盖现有全部报价 + 可预见的扩展
-- SQM     平方米    地板/瓷砖/墙面/台面
-- LM      延米      橱柜/吊顶/踢脚线
-- PIECE   件        门/窗/开关/洁具（「樘」也归这里）
-- SET     套/项     整包项目、定制柜体
-- PACKAGE 桶/袋/箱  涂料/腻子/水泥
-- DAY     工日      人工
```

### 3.2 `workload_factors`：从面积到工程量

```sql
create table workload_factors (
    item_key    varchar(32)  not null,   -- GROUND / WALL / KITCHEN ...
    unit_kind   varchar(16)  not null,   -- SQM / DAY ...
    space_type  varchar(32)  not null,   -- WHOLE_HOME / LIVING / BEDROOM / KITCHEN ...
    basis       varchar(24)  not null,   -- BUILDING_AREA / INTERIOR_AREA / WALL_AREA
    per_sqm     numeric(10,4) not null,  -- 每 1 单位 basis 对应的工程量
    waste_rate  numeric(5,4) not null default 0,
    note        varchar(200),
    primary key (item_key, unit_kind, space_type)
);
```

初始数据（`space_type = 'WHOLE_HOME'`）：

| item_key | unit_kind | basis | per_sqm | waste_rate |
|---|---|---|---|---|
| DEMOLITION | DAY | INTERIOR_AREA | 0.45 | 0 |
| MASONRY | DAY | INTERIOR_AREA | 0.35 | 0 |
| WALL_MATERIAL | SQM | WALL_AREA | 1.0000 | 0.10 |
| WALL_LABOR | DAY | WALL_AREA | 0.06 | 0 |
| GROUND | SQM | INTERIOR_AREA | 0.72 | 0.05 |
| KITCHEN | SQM | INTERIOR_AREA | 0.06 | 0.08 |

`waste_rate` 依据：地板 5%、瓷砖 8%、涂料 10%、墙纸 12%，取各自分项的保守值。

### 3.3 `budget_item_categories`：分项 ↔ 报价类目的映射

**不能靠字符串相等**，因为 `material_quotes.category` 是自由文本。

```sql
create table budget_item_categories (
    item_key   varchar(32) not null,
    source     varchar(16) not null,   -- MATERIAL / LABOR
    category   varchar(80) not null,   -- material_quotes.category 或 labor_quotes.labor_type
    priority   integer     not null default 1,  -- 同一分项多类目时，数字小的优先
    primary key (item_key, source, category)
);
```

初始映射：

| item_key | source | category | priority |
|---|---|---|---|
| MASONRY | LABOR | 瓦匠工 | 1 |
| WALL | MATERIAL | 涂料 | 1 |
| WALL | MATERIAL | 墙壁 | 2 |
| WALL | LABOR | 油漆工 | 1 |
| GROUND | MATERIAL | 地板 | 1 |
| KITCHEN | MATERIAL | 厨房 | 1 |

> 企业录入报价时，`category` 应该从下拉里选（枚举化），而不是手填。
> 但这会改动企业端表单，放到阶段 2b 之后做；2a 先用映射表兜住现有数据。

### 3.4 `budget_reference_bands`：把前端的 `referenceCosts` 搬到后端

```sql
create table budget_reference_bands (
    item_key      varchar(32) not null,
    finish_level  varchar(16) not null,  -- BASIC / STANDARD / PREMIUM
    low_per_sqm   numeric(10,2) not null,
    high_per_sqm  numeric(10,2) not null,
    primary key (item_key, finish_level)
);
```

现在 `src/pages/BudgetPage.tsx:17-24` 的 6 条常量（`320-520`、`280-450` …）原样迁移，
再按档位系数 `0.82 / 1.00 / 1.34`（同 `:11-15`）展开成三档。

**这一步是纯搬迁，不改变现有输出**——现有 `BudgetPage` 的结果必须能被新接口完全复现，
这是阶段 2a 的回归基准。

### 3.5 `project_budget_estimates`：保存试算结果

```sql
create table project_budget_estimates (
    id            uuid primary key,
    owner_id      uuid        not null,   -- 与 projects 的归属一致
    project_id    uuid,                   -- 可空：不关联项目也能试算
    input_json    jsonb       not null,
    result_json   jsonb       not null,
    total_low     numeric(14,2) not null,
    total_high    numeric(14,2) not null,
    data_quality  varchar(16)  not null,  -- REFERENCE / PARTIAL / QUOTED
    created_at    timestamptz  not null,
    updated_at    timestamptz  not null
);
```

---

## 4. 计算流程

```
POST /api/v1/budgets/estimate
{ area, region, finishLevel, spaceType, projectId? }

1. 解析输入
   area 1..2000，finishLevel ∈ {BASIC,STANDARD,PREMIUM}

2. 计算中间量
   interiorArea = area × 得房率(spaceType 查表)
   wallArea     = interiorArea × 2.55

3. 逐分项求值（6 项）
   for item in items:
     qtyBase = workload_factors[item] × basis 值
     qtyLow  = qtyBase × 0.92
     qtyHigh = qtyBase × 1.08

     quotes = 匹配报价(item, region)
     if quotes.企业数 >= 3:
        priceLow  = percentile(quotes, 0.25)
        priceHigh = percentile(quotes, 0.75)
        costLow  = qtyLow  × priceLow  × (1 + waste)
        costHigh = qtyHigh × priceHigh × (1 + waste)
        source   = 'QUOTED'
     else:
        band     = budget_reference_bands[item][finishLevel]
        costLow  = band.low_per_sqm  × area
        costHigh = band.high_per_sqm × area
        source   = 'REFERENCE'

4. 人工叠加（与材料分开）
   for labor in 分项对应人工:
     同样走 quotes / 降级两分支
     cost += laborCost

5. 管理费
   overhead = (Σ材料 + Σ人工) × 0.12

6. 汇总
   totalLow / totalHigh
   dataQuality = 全部 QUOTED ? QUOTED
               : 至少一项 QUOTED ? PARTIAL
               : REFERENCE
```

### 4.1 报价匹配规则（`匹配报价`）

按顺序应用，任何一步不满足即被剔除：

```
1. category 经 budget_item_categories 映射命中该分项
2. unit_kind 与 workload_factors 要求的单位一致
3. unit_unknown = false                      （单位误填的排除）
4. admin_hidden = false                      （已下架排除）
5. valid_until >= current_date               （过期排除）
6. 地区：优先同城；同城企业数不足 3 家时，放宽到全国并在结果里标注
```

### 4.2 分位数怎么算

样本量小（现在最多 2 条），用**线性插值**即可，不必引统计库：

```java
static BigDecimal percentile(List<BigDecimal> sorted, double p) {
    if (sorted.isEmpty()) return null;
    if (sorted.size() == 1) return sorted.get(0);
    double idx = p * (sorted.size() - 1);
    int lo = (int) Math.floor(idx), hi = (int) Math.ceil(idx);
    if (lo == hi) return sorted.get(lo);
    var frac = BigDecimal.valueOf(idx - lo);
    return sorted.get(lo).multiply(BigDecimal.ONE.subtract(frac))
        .add(sorted.get(hi).multiply(frac))
        .setScale(2, RoundingMode.HALF_UP);
}
```

---

## 5. 三层降级（核心）

### 5.1 降级阶梯

```
L3 QUOTED    全部 6 个分项都有 ≥3 家企业报价
              → 结果完全由真实报价驱动
              → UI：「基于 N 家企业的现行报价」

L2 PARTIAL   部分分项有报价，其余用基准
              → 有报价的项用真实价，没报价的项用基准占比回填
              → UI：「部分分项基于企业报价，其余为行业参考」★ 现在会落在这里

L1 REFERENCE 0 个分项满足条件
              → 完全等于今天的 BudgetPage 输出
              → UI：「行业参考区间，尚无可比企业报价」
```

**关键设计：缺失分项用基准回填，绝不用 0。**
不然只有地板报价时，用户会看到一个「去掉 40% 分项」的荒谬低值。

### 5.2 为什么门槛是「3 家企业」而不是「3 条报价」

- 1 家企业 → 平台在替这家企业背书价格（商业风险，见 §1.3）
- 2 家企业 → 仍可能被单家主导
- 3 家企业 → 有最低限度的市场代表性

门槛写成配置项 `app.budget.min-company-count`（默认 3），方便后续调。

**注意**：现在地板类目有 2 家企业（筑境、栖居），**不满足 3 家**，所以真实数据下整个预算仍然走 L1。
这是预期行为 —— 建模完成不等于立刻有数据可用。要看到 L2/L3 效果，得先补企业报价。

### 5.3 数据质量要透传给前端

响应里带 `dataQuality` 和每个分项的 `source`：

```json
{
  "totalLow": 182400.00,
  "totalHigh": 304600.00,
  "dataQuality": "PARTIAL",
  "items": [
    { "itemKey": "GROUND", "label": "地面铺装",
      "source": "QUOTED",
      "qty": 67.4, "unitKind": "SQM",
      "unitPriceLow": 268.00, "unitPriceHigh": 299.00,
      "companyCount": 2,
      "costLow": 17166.00, "costHigh": 21167.00,
      "quoteSamples": [
        { "name": "浅橡木复合地板", "price": 268.00, "companyName": "栖居美学设计" },
        { "name": "原木复合地板", "price": 299.00, "companyName": "筑境设计事务所" }
      ] },
    { "itemKey": "MASONRY", "label": "泥瓦与防水",
      "source": "REFERENCE",
      "costLow": 33600.00, "costHigh": 54000.00 }
  ]
}
```

`source` 逐项可见，用户就知道「哪部分是报价、哪部分是估算」。
`quoteSamples` 让用户能点进去看原始报价 —— 这是「预算可解释」的关键，也是企业报价的曝光位。

---

## 6. 落地顺序

### 6.1 V20 迁移

```sql
-- 1) 单位枚举化
alter table material_quotes
    add column unit_kind    varchar(16),
    add column unit_unknown boolean not null default false;

alter table labor_quotes
    add column unit_kind         varchar(16),
    add column unit_unknown      boolean not null default false,
    add column admin_hidden      boolean not null default false,
    add column admin_hidden_reason varchar(500);

-- 2) 回填 unit_kind（只认明确的计量单位）
update material_quotes set unit_kind = case
    when unit in ('㎡','m2','m²','平方米','平米','平方') then 'SQM'
    when unit in ('m','米','延米')                       then 'LM'
    when unit in ('樘','个','件','块','片')              then 'PIECE'
    when unit in ('套','项','组')                        then 'SET'
    when unit in ('桶','袋','箱','包')                   then 'PACKAGE'
    when unit in ('工日','人日','天')                    then 'DAY'
    else 'UNKNOWN' end;

update labor_quotes set unit_kind = case
    when unit in ('工日','人日','天') then 'DAY'
    when unit in ('㎡','平方米','平米') then 'SQM'
    when unit in ('延米','米','m')     then 'LM'
    else 'UNKNOWN' end;

update material_quotes set unit_unknown = (unit_kind = 'UNKNOWN');
update labor_quotes    set unit_unknown = (unit_kind = 'UNKNOWN');

-- 3) 新增四张表（workload_factors / budget_item_categories /
--    budget_reference_bands / project_budget_estimates），见 §3
```

**回填后预期**：`木地板(unit=mm)`、`墙纸(unit=mm)` 被标记 `unit_unknown = true`，不参与计算。
同时企业端要能看到提示「该报价单位无法识别，请修正为 平方米/延米/件/套/桶/工日」。

### 6.2 代码落地

| 层 | 文件 | 内容 |
|---|---|---|
| 迁移 | `backend/.../db/migration/V20__create_budget_model.sql` | 上述 SQL + 种子数据 |
| DTO | `backend/.../budget/BudgetDtos.java` | `EstimateRequest` / `EstimateResult` / `BudgetItem` / `QuoteSample` |
| 服务 | `backend/.../budget/BudgetEstimateService.java` | §4 全部逻辑，纯函数式，便于单测 |
| 控制器 | `backend/.../budget/BudgetController.java` | `POST /api/v1/budgets/estimate`、`POST/GET/DELETE /api/v1/budgets` |
| 前端 | `src/services/budgetApi.ts` | 调接口；后端不可用时返回 `null` |
| 前端 | `src/pages/BudgetPage.tsx` | 接口优先，`null` 时回退现有本地计算 |

**前端回退必须保留。** 后端没起、或用户离线时，页面不能白屏 —— 今天的 `referenceCosts` 就是兜底。

### 6.3 系数校准（做完之后才做）

`workload_factors.per_sqm` 现在是我拍的行业经验值。真正的校准方式：

```
对企业已录入的 business_cases（有 area + budget + style）
反推：实际造价 ÷ 面积 ÷ 基准单价 = 隐含 per_sqm
累计 ≥ 20 条后，用中位数替换初始系数
```

`business_cases` 表现在有 `area` / `budget` 两列，具备反推条件。

---

## 7. 验收标准

阶段 2a 完成时，以下必须全部成立：

| # | 验收项 | 判据 |
|---|---|---|
| 1 | **回归一致** | 清空企业报价时，新接口输出的 6 个分项与现在 `BudgetPage` 的前端计算完全一致（逐项差值 = 0） |
| 2 | 单位治理 | `unit_unknown = true` 的报价不进入任何计算结果；企业端能看到修正提示 |
| 3 | 门槛生效 | 某类目注满 2 家企业报价时仍走 REFERENCE；补到第 3 家后自动切到 QUOTED |
| 4 | 过期过滤 | `valid_until < today` 的报价不参与计算 |
| 5 | 下架过滤 | 材料 `admin_hidden = true` 后，其材料与关联人工都不参与计算 |
| 6 | 地区降级 | 同城企业数 < 3 时放宽到全国，响应中标注 `regionFallback: true` |
| 7 | 质量透传 | `dataQuality` 与逐项 `source` 正确反映实际取值来源 |
| 8 | 边界 | `area = 0 / 2001 / 'abc'` 返回 400 且信息明确 |
| 9 | 单测 | `BudgetEstimateService` 的分位数、降级分支、损耗率各有独立用例 |
| 10 | 不阻塞前端 | 后端停止时 `/budget` 页面仍可用（回退本地计算） |

---

## 8. 需要先拍板的三个决定

### 决定 1：得房率怎么取

| 方案 | 说明 |
|---|---|
| **A. 固定 0.78**（推荐） | 简单，误差 ±5%；用户无感 |
| B. 按户型/城市查表 | 准确，但要维护一张城市表，且用户不一定知道自己的得房率 |
| C. 让用户输入套内面积 | 最准，但多一个输入项，转化率会掉 |

建议 A 起步，`workload_factors.basis` 设计成可切换，后面换 B 不用改公式。

### 决定 2：真实报价不够时，是否允许「1~2 家企业」出结果

| 方案 | 说明 |
|---|---|
| **A. 严格 ≥3 家，否则降级**（推荐） | 合规、公平；代价是短期看不到 L2/L3 |
| B. ≥1 家就出，但标注「仅 1 家企业报价」 | 数据见效快；风险是变相背书单一企业 |
| C. 按类目分别设门槛 | 灵活但复杂 |

建议 A，门槛做成配置项。如果业务上急需看到真实报价效果，先补企业数据比放宽门槛更划算。

### 决定 3：管理费率是固定值还是区间

| 方案 | 说明 |
|---|---|
| **A. 固定 12%**（推荐） | 现在是「安装辅料与管理 180-320 元/㎡」，本身是区间；改成固定费率会让区间变窄，但更可解释 |
| B. 保留 10%~15% 区间 | 区间更宽，贴近现状，但用户更难判断 |

建议 A，因为管理费本身不该是预算的浮动来源 —— 浮动应该来自材料与人工。

---

## 9. 与现有实现的衔接

| 现有 | 2a 之后 |
|---|---|
| `BudgetPage.tsx:17-24` `referenceCosts` 常量 | 迁到 `budget_reference_bands`，前端保留一份作为离线兜底 |
| `BudgetPage.tsx:11-15` `finishLevels` 档位系数 | 保留，作为 `budget_reference_bands` 的三档展开依据 |
| `BudgetPage.tsx:49-61` 本地 `estimate` useMemo | 保留为 fallback；接口成功时用接口结果 |
| `BudgetPage.tsx:136` 「演示用样例估算」文案 | 按 `dataQuality` 三态改写 |
| `budgets` 与 `projects` 的关系 | `project_budget_estimates.project_id` 可空，保存时才写入 |

**一句话**：阶段 2a 不是「重写预算页」，是「给预算页换一个更强的数据源，并保留原来的兜底」。
