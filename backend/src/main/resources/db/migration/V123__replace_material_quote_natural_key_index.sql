-- Fail transactionally on duplicate keys; never delete historical quotes during upgrade.
drop index if exists material_quotes_natural_key_idx;

-- 决策 9 的自然键：企业 + 名称 + 规格 + 品牌 + 单位，全部去首尾空白后比较、忽略大小写。
-- 品牌可为空，null 与空串视为同一个值。
create unique index material_quotes_natural_key_idx
    on material_quotes (company_id, lower(btrim(name)), lower(btrim(specification)),
                        lower(btrim(coalesce(brand, ''))), lower(btrim(unit)));

