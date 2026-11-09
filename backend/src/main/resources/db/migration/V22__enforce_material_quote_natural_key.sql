-- 材料报价的自然键：同一企业下「名称 + 规格 + 品牌 + 单位」唯一。
-- 报价是按企业维护的价格表，同一家企业把同一件材料录两遍只会让预算重复计入，
-- 因此用唯一索引在数据库层兜底，应用层再翻译成 409 DUPLICATE_QUOTE。

-- 先归档历史重复行：保留每组的 winner（更新时间最新、其次 id 最小），其余软删到 archive 表，
-- 这样生产上已有的重复数据不会让迁移失败，也留了回滚的原始数据。
create table if not exists material_quotes_archive (
    like material_quotes including defaults
);

insert into material_quotes_archive
    select * from material_quotes
    where id in (
        select id from (
            select id,
                   row_number() over (
                       partition by company_id, lower(name), lower(specification),
                                    lower(coalesce(brand, '')), lower(unit)
                       order by updated_at desc, id
                   ) as rn
            from material_quotes
        ) ranked
        where rn > 1
    )
    on conflict do nothing;

delete from material_quotes
where id in (select id from material_quotes_archive);

-- 名称、规格、单位都要求非空且去空格；品牌可为空，空串与 null 视为同一个值。
create unique index if not exists material_quotes_natural_key_idx
    on material_quotes (company_id, lower(btrim(name)), lower(btrim(specification)),
                        lower(btrim(coalesce(brand, ''))), lower(btrim(unit)));
