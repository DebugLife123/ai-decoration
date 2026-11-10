-- 预算建模 2a-4：套餐式计价（pricing_mode = PACKAGE）
--
-- 来源：docs/ROADMAP.md 阶段 2a-4。模板「全包外部」整张表就是一种套餐报价，
-- 公式：合同总造价 = 套餐单价(元/㎡) × max(实测框架面积, 最低面积) + 增减项 + 管理费 10%。
-- 管理费属 2a-5，本迁移不含。
--
-- 模板缺陷提醒（抄结构不抄数）：模板 全包外部!G49 = 1098*B3，但文案写「898 元/㎡」，
-- 且 G50 = #REF!。这里不采用 898/1098 任何一个数字，种子价是平台占位值，
-- 真实套餐由企业自己录入（company_id 非空）。

create table if not exists package_products (
    id             uuid primary key default gen_random_uuid(),
    -- null 表示平台通用套餐（还没有企业入驻时也能用）；非空是企业自报价套餐。
    company_id     uuid,
    name           varchar(80)  not null,
    -- 套餐单价（元/㎡），按「实测框架面积」计，不按建筑面积。
    price_per_sqm  numeric(10,2) not null,
    -- 最低计价面积：小于它按它算（模板里的 90㎡ 兜底）。
    min_area       numeric(8,2)  not null default 90,
    -- 套餐价的材料/人工拆分占比。
    -- 整包价本身不拆板块，但试算结果必须给出 materialCost 与 laborCost，
    -- 且沿用 2a-3 的不变量「materialCost + laborCost = cost」，所以拆一次。
    material_ratio numeric(5,4)  not null default 0.75,
    valid_until    date          not null,
    -- 套餐内含的配置清单：[{"itemKey": "GROUND", "label": "瓷砖 800×800 通铺"}, ...]
    -- itemKey 用于判断「用户额外点名的板块是否已在套餐内」；缺省会按默认参与的板块处理。
    items_json     jsonb         not null default '[]'::jsonb,
    status         varchar(16)   not null default 'ACTIVE',
    created_at     timestamptz   not null default now(),
    constraint package_products_status_check check (status in ('ACTIVE', 'INACTIVE')),
    constraint package_products_price_check check (price_per_sqm > 0),
    constraint package_products_min_area_check check (min_area > 0),
    constraint package_products_ratio_check check (material_ratio >= 0 and material_ratio <= 1)
);

-- 同一家企业不允许出现重名套餐，避免选择时无法区分两条同价同名的记录。
create unique index if not exists package_products_company_name_idx
    on package_products (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
                         lower(btrim(name)));

create index if not exists package_products_active_idx
    on package_products (status, valid_until);

-- 平台通用套餐：让 PACKAGE 模式在没有任何企业套餐时也能跑通。
-- 价格是占位值，运营/企业可在后台改成真实套餐价，不影响代码。
--
-- 清单刻意不含 CARPENTRY（家具制作）与 STRUCTURE（结构改造）：
-- 这两项在套餐里几乎不可能标准化定价，模板把它们放在「增减项」里单独算。
-- docs/ROADMAP.md 的 2a-4 验收第 2 条正是「套餐模式不出现家具制作、结构改造等清单项」。
insert into package_products (company_id, name, price_per_sqm, min_area, material_ratio, valid_until,
                              items_json, status)
values (null, '全包基础套餐', 1180.00, 90, 0.75, date '2099-12-31',
        '[
           {"itemKey": "GROUND",        "label": "地面：瓷砖/木地板通铺，含找平与防水"},
           {"itemKey": "CEILING",       "label": "顶面：客餐厅四周吊顶、厨卫集成吊顶"},
           {"itemKey": "WALL_DOOR",     "label": "墙面：墙漆两遍、厨卫墙砖、室内门"},
           {"itemKey": "PLUMBING_ELEC", "label": "水电：强弱电改造、给排水、开关插座"},
           {"itemKey": "MEASURES",      "label": "措施：成品保护、垃圾清运、材料上楼"},
           {"itemKey": "MAIN_MATERIAL", "label": "主材：地板、瓷砖、石材、合金门"},
           {"itemKey": "FIXTURE",       "label": "设备：卫浴洁具、开关灯具、集成吊顶"}
         ]'::jsonb,
        'ACTIVE')
on conflict do nothing;
