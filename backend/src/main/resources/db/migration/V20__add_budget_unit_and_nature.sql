-- 预算建模 2a-1：单位枚举化 + 项目性质 + 最低计量规则
-- 依据：docs/BUDGET_SECTIONS.md §7.3（复合单位）、§4.2（最低计量）、§7.2（项目性质）

-- 1) 材料报价：单位枚举 + 单位不可识别标记 + 项目性质
alter table material_quotes
    add column if not exists unit_kind    varchar(20),
    add column if not exists unit_unknown boolean not null default false,
    add column if not exists item_nature  varchar(20) not null default 'INCLUDED';

alter table material_quotes
    drop constraint if exists material_quotes_item_nature_check;
alter table material_quotes
    add constraint material_quotes_item_nature_check
        check (item_nature in ('INCLUDED', 'GIFT', 'OWNER_SUPPLIED'));

-- 2) 人工报价：对齐 material_quotes 的字段（原来缺 admin_hidden，材料下架后人工仍参与计算）
alter table labor_quotes
    add column if not exists unit_kind    varchar(20),
    add column if not exists unit_unknown boolean not null default false,
    add column if not exists item_nature  varchar(20) not null default 'INCLUDED',
    add column if not exists admin_hidden boolean not null default false,
    add column if not exists admin_hidden_reason varchar(500);

alter table labor_quotes
    drop constraint if exists labor_quotes_item_nature_check;
alter table labor_quotes
    add constraint labor_quotes_item_nature_check
        check (item_nature in ('INCLUDED', 'GIFT', 'OWNER_SUPPLIED'));

-- 3) 回填 unit_kind
--    11 类：SQM / LM / PIECE / SET / PACKAGE / DAY
--           LM_PER_LEVEL / SQM_PER_FLOOR / LM_PER_FLOOR / CM_PER_SQM / SET_LM
--           HOUSE / ROOM
--    注意：'mm' 不是计量单位（是规格单位误填），必须落到 UNKNOWN 而不是被当成 SQM。
update material_quotes set unit_kind = case
    when lower(trim(unit)) in ('㎡', 'm2', 'm²', '平方米', '平米', '平方') then 'SQM'
    when lower(trim(unit)) in ('m', '米', '延米')                          then 'LM'
    when trim(unit) in ('樘', '个', '件', '块', '片', '扇', '盏', '根')      then 'PIECE'
    when trim(unit) in ('套', '项', '组')                                   then 'SET'
    when trim(unit) in ('桶', '袋', '箱', '包')                             then 'PACKAGE'
    when trim(unit) in ('工日', '人日', '天')                               then 'DAY'
    when lower(trim(unit)) in ('m/级')                                     then 'LM_PER_LEVEL'
    when lower(trim(unit)) in ('m2/层', '㎡/层')                           then 'SQM_PER_FLOOR'
    when lower(trim(unit)) in ('m/层')                                     then 'LM_PER_FLOOR'
    when lower(trim(unit)) in ('cm/m2', 'cm/㎡')                           then 'CM_PER_SQM'
    when trim(unit) in ('套米')                                             then 'SET_LM'
    when trim(unit) in ('户')                                              then 'HOUSE'
    when trim(unit) in ('间')                                              then 'ROOM'
    else 'UNKNOWN' end
where unit_kind is null;

update labor_quotes set unit_kind = case
    when lower(trim(unit)) in ('工日', '人日', '天')      then 'DAY'
    when lower(trim(unit)) in ('㎡', 'm2', 'm²', '平方米', '平米') then 'SQM'
    when lower(trim(unit)) in ('延米', '米', 'm')          then 'LM'
    when trim(unit) in ('樘', '个', '件')                  then 'PIECE'
    when trim(unit) in ('项', '套')                        then 'SET'
    else 'UNKNOWN' end
where unit_kind is null;

update material_quotes set unit_unknown = (unit_kind = 'UNKNOWN');
update labor_quotes    set unit_unknown = (unit_kind = 'UNKNOWN');

create index if not exists idx_material_quotes_unit_kind on material_quotes(unit_kind);
create index if not exists idx_labor_quotes_unit_kind    on labor_quotes(unit_kind);

-- 4) 最低计量规则（模板 H 列备注里散落的 8 条，见 BUDGET_SECTIONS.md §4.2）
create table if not exists budget_min_qty (
    item_key   varchar(40) not null,
    unit_kind  varchar(20) not null,
    min_qty    numeric(10,4) not null,
    scope      varchar(16) not null default 'PER_LINE',
    note       varchar(200),
    primary key (item_key, unit_kind, scope),
    constraint budget_min_qty_scope_check check (scope in ('PER_LINE', 'PER_ROOM', 'PER_HOUSE'))
);

insert into budget_min_qty (item_key, unit_kind, min_qty, scope, note) values
    ('CARPENTRY_DOOR', 'SQM', 0.4,  'PER_LINE',  '单扇不足 0.4㎡ 按 0.4㎡ 计算'),
    ('CARPENTRY_TOP',  'SQM', 1.0,  'PER_LINE',  '单处不足 1㎡ 按 1㎡ 计算'),
    ('PLUMBING_METER', 'LM',  1.0,  'PER_LINE',  '水表移位不足 1000mm 按 1000mm 计算'),
    ('DOOR_SLIDING',   'SQM', 1.6,  'PER_LINE',  '厨房推拉门单页不足 1.6㎡ 按 1.6㎡ 结算'),
    ('WALL_VARNISH',   'SQM', 20.0, 'PER_LINE',  '清漆不足 20㎡ 按 20㎡ 计量'),
    ('WALL_PAINT',     'SQM', 15.0, 'PER_LINE',  '其余油漆不足 15㎡ 按 15㎡ 计量'),
    ('PLUMBING_ELEC',  'SQM', 85.0, 'PER_HOUSE', '水电改造面积不足 85㎡ 按 85㎡ 计算'),
    ('PACKAGE_BASE',   'SQM', 90.0, 'PER_HOUSE', '套餐面积不足 90㎡ 按 90㎡ 计算')
on conflict (item_key, unit_kind, scope) do nothing;
