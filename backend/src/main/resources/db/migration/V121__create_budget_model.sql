-- 预算建模 2a-2：板块从 6 项细分为 9 项（对齐 docs/BUDGET_SECTIONS.md §6）
-- 基准区间合计守恒：low 1790 / high 3110（元/㎡ BASIC 档），与前端
-- src/pages/BudgetPage.tsx 原有 6 项 referenceCosts 完全一致，保证回归基准。

-- 1) 基准区间表：无企业报价时的兜底
create table if not exists budget_reference_bands (
    item_key      varchar(40) not null,
    finish_level  varchar(16) not null,
    low_per_sqm   numeric(10,2) not null,
    high_per_sqm  numeric(10,2) not null,
    note          varchar(200),
    primary key (item_key, finish_level),
    constraint budget_reference_bands_level_check
        check (finish_level in ('BASIC', 'STANDARD', 'PREMIUM'))
);

-- BASIC 档 = 前端原有常量（合计 1790–3110）
insert into budget_reference_bands (item_key, finish_level, low_per_sqm, high_per_sqm, note) values
    ('GROUND',         'BASIC',    190.00, 330.00, '建安一：瓷砖铺贴、防水、回填、找平、门槛石'),
    ('CEILING',        'BASIC',     70.00, 120.00, '建安二：石膏板吊顶、灯光槽、窗帘盒'),
    ('WALL_DOOR',      'BASIC',    180.00, 310.00, '建安三：厨卫墙砖、包下水管、墙漆、背景墙'),
    ('CARPENTRY',      'BASIC',    240.00, 420.00, '建安四：柜体、柜门、抽屉、榻榻米、油漆'),
    ('PLUMBING_ELEC',  'BASIC',    320.00, 520.00, '建安五：给水强弱电、排水、开关插座安装'),
    ('STRUCTURE',      'BASIC',     50.00, 100.00, '建安六：拆墙砌墙、隔墙、现浇'),
    ('MEASURES',       'BASIC',    180.00, 320.00, '建安七：成品保护、垃圾清运、上楼、防开裂（含管理费，2a-5 拆出）'),
    ('MAIN_MATERIAL',  'BASIC',    400.00, 680.00, '主材：木地板、瓷砖、石材、合金门、成品门'),
    ('FIXTURE',        'BASIC',    160.00, 310.00, '主材：卫浴洁具、橱柜、集成吊顶、开关插座灯具')
on conflict (item_key, finish_level) do nothing;

-- STANDARD = BASIC × 1.00（不变），PREMIUM = ×1.34
insert into budget_reference_bands (item_key, finish_level, low_per_sqm, high_per_sqm, note)
select item_key, 'STANDARD', low_per_sqm, high_per_sqm, note || '（舒适档）'
from budget_reference_bands where finish_level = 'BASIC'
on conflict (item_key, finish_level) do nothing;

insert into budget_reference_bands (item_key, finish_level, low_per_sqm, high_per_sqm, note)
select item_key, 'PREMIUM', round(low_per_sqm * 1.34, 2), round(high_per_sqm * 1.34, 2), note || '（品质档）'
from budget_reference_bands where finish_level = 'BASIC'
on conflict (item_key, finish_level) do nothing;

-- 2) 工程量系数：面积 → 工程量
create table if not exists workload_factors (
    item_key    varchar(40) not null,
    unit_kind   varchar(20) not null,
    space_type  varchar(32) not null default 'WHOLE_HOME',
    basis       varchar(24) not null,          -- BUILDING_AREA / INTERIOR_AREA / WALL_AREA
    per_sqm     numeric(10,4) not null,
    waste_rate  numeric(5,4) not null default 0,
    note        varchar(200),
    primary key (item_key, unit_kind, space_type),
    constraint workload_factors_basis_check
        check (basis in ('BUILDING_AREA', 'INTERIOR_AREA', 'WALL_AREA')),
    constraint workload_factors_waste_check check (waste_rate >= 0 and waste_rate < 1)
);

insert into workload_factors (item_key, unit_kind, space_type, basis, per_sqm, waste_rate, note) values
    ('GROUND',        'SQM', 'WHOLE_HOME', 'INTERIOR_AREA', 0.7200, 0.0500, '铺装面积 ≈ 套内 × 0.72，地板损耗 5%'),
    ('CEILING',       'SQM', 'WHOLE_HOME', 'INTERIOR_AREA', 0.5500, 0.0500, '吊顶面积 ≈ 套内 × 0.55，损耗 5%'),
    ('WALL_DOOR',     'SQM', 'WHOLE_HOME', 'WALL_AREA',     1.0000, 0.0800, '墙砖按墙面展开面积，损耗 8%（模板：瓷砖 ×1.08）'),
    ('CARPENTRY',     'LM',  'WHOLE_HOME', 'INTERIOR_AREA', 0.3500, 0.0300, '柜体延米 ≈ 套内 × 0.35，损耗 3%'),
    ('PLUMBING_ELEC', 'SQM', 'WHOLE_HOME', 'INTERIOR_AREA', 1.0000, 0.0000, '按面积计费，最低 85㎡ 由 budget_min_qty 兜底'),
    ('STRUCTURE',     'SQM', 'WHOLE_HOME', 'INTERIOR_AREA', 1.0000, 0.0000, '按面积计费，老房默认含、新房可在请求里关闭'),
    ('MEASURES',      'SQM', 'WHOLE_HOME', 'INTERIOR_AREA', 1.0000, 0.0000, '措施与杂费按面积摊销（成品保护、清运、上楼）'),
    ('MAIN_MATERIAL', 'SQM', 'WHOLE_HOME', 'INTERIOR_AREA', 0.7200, 0.0500, '主材地板/瓷砖，引用 GROUND 用量'),
    ('FIXTURE',       'SET', 'WHOLE_HOME', 'INTERIOR_AREA', 0.0300, 0.0000, '卫浴/吊顶按套，≈ 套内 × 0.03')
on conflict (item_key, unit_kind, space_type) do nothing;

-- 3) 分项 ↔ 报价类目映射（category 是自由文本，不能靠字符串相等）
create table if not exists budget_item_categories (
    item_key  varchar(40) not null,
    source    varchar(16) not null,            -- MATERIAL / LABOR
    category  varchar(80) not null,            -- material_quotes.category 或 labor_quotes.labor_type
    priority  integer     not null default 1,  -- 同一分项多类目时数字小的优先
    primary key (item_key, source, category),
    constraint budget_item_categories_source_check check (source in ('MATERIAL', 'LABOR'))
);

insert into budget_item_categories (item_key, source, category, priority) values
    ('GROUND',        'MATERIAL', '地板', 1),
    ('GROUND',        'MATERIAL', '瓷砖', 2),
    ('GROUND',        'MATERIAL', '地面', 1),
    ('GROUND',        'LABOR',    '瓦匠工', 1),
    ('GROUND',        'LABOR',    '铺装工', 2),
    ('CEILING',       'MATERIAL', '吊顶', 1),
    ('CEILING',       'LABOR',    '木工', 1),
    ('WALL_DOOR',     'MATERIAL', '涂料', 1),
    ('WALL_DOOR',     'MATERIAL', '墙壁', 2),
    ('WALL_DOOR',     'MATERIAL', '墙纸', 3),
    ('WALL_DOOR',     'LABOR',    '油漆工', 1),
    ('CARPENTRY',     'MATERIAL', '柜体', 1),
    ('CARPENTRY',     'MATERIAL', '板材', 2),
    ('CARPENTRY',     'LABOR',    '木工', 1),
    ('PLUMBING_ELEC', 'MATERIAL', '水电', 1),
    ('PLUMBING_ELEC', 'MATERIAL', '管材', 2),
    ('PLUMBING_ELEC', 'LABOR',    '水电工', 1),
    ('STRUCTURE',     'LABOR',    '拆除工', 1),
    ('MEASURES',      'MATERIAL', '辅料', 1),
    ('MAIN_MATERIAL', 'MATERIAL', '地板', 1),
    ('MAIN_MATERIAL', 'MATERIAL', '瓷砖', 2),
    ('MAIN_MATERIAL', 'MATERIAL', '石材', 3),
    ('MAIN_MATERIAL', 'MATERIAL', '门窗', 4),
    ('FIXTURE',       'MATERIAL', '卫浴', 1),
    ('FIXTURE',       'MATERIAL', '橱柜', 2),
    ('FIXTURE',       'MATERIAL', '灯具', 3),
    ('FIXTURE',       'MATERIAL', '厨房', 4)
on conflict (item_key, source, category) do nothing;

-- 4) 板块显示名与材料占比（材料/人工分离计价在 2a-3 用）
create table if not exists budget_items (
    item_key       varchar(40) primary key,
    label          varchar(60) not null,
    sort_order     integer     not null default 0,
    material_ratio numeric(5,4) not null default 0.7,
    unit_kind      varchar(20) not null,
    default_on     boolean     not null default true,
    note           varchar(200)
);

insert into budget_items (item_key, label, sort_order, material_ratio, unit_kind, default_on, note) values
    ('GROUND',        '地面工程',       1, 0.7200, 'SQM', true,  '建安一'),
    ('CEILING',       '顶面工程',       2, 0.5500, 'SQM', true,  '建安二'),
    ('WALL_DOOR',     '墙面与门窗',     3, 0.5000, 'SQM', true,  '建安三'),
    ('CARPENTRY',     '家具制作',       4, 0.7800, 'LM',  true,  '建安四'),
    ('PLUMBING_ELEC', '水电改造',       5, 0.4500, 'SQM', true,  '建安五，最低 85㎡'),
    ('STRUCTURE',     '结构改造',       6, 0.5500, 'SQM', false, '建安六，默认不含拆改'),
    ('MEASURES',      '措施与杂费',     7, 0.6000, 'SQM', true,  '建安七，含管理费（2a-5 拆出）'),
    ('MAIN_MATERIAL', '主材',           8, 0.8500, 'SQM', true,  '地板/瓷砖/石材/门'),
    ('FIXTURE',       '设备与洁具',     9, 0.8200, 'SET', true,  '卫浴/橱柜/吊顶/开关灯具')
on conflict (item_key) do nothing;

-- 5) 保存的试算结果
create table if not exists project_budget_estimates (
    id            uuid primary key,
    owner_id      uuid        not null,
    project_id    uuid,
    pricing_mode  varchar(16) not null default 'LIST',
    model_version varchar(16) not null default 'v3',
    input_json    jsonb       not null,
    result_json   jsonb       not null,
    total_low     numeric(14,2) not null,
    total_high    numeric(14,2) not null,
    data_quality  varchar(16) not null,
    created_at    timestamptz not null default now()
);

create index if not exists idx_project_budget_owner on project_budget_estimates(owner_id, created_at desc);
create index if not exists idx_project_budget_project on project_budget_estimates(project_id, created_at desc);
