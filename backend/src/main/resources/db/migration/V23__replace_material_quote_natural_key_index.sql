-- 修正 V22 没有真正落地的问题：把材料报价的唯一索引换成契约决策 9 的口径。
--
-- 背景：V2（V2__create_business_workspace_tables.sql）就建过一个**同名**索引
--   material_quotes_natural_key_idx
-- 但口径是 (company_id, name, specification, unit, region, valid_until)，不含 brand。
-- V22 用 `create unique index if not exists material_quotes_natural_key_idx` 重建，
-- 由于同名索引已存在，整句被静默跳过（只留一条 42P07 警告），
-- 结果线上一直生效的是 V2 的旧口径：
--   1. 同一材料换品牌可以重复录入 —— 决策 9 明令禁止；
--   2. 换地区或换有效期会被当成新报价 —— 这两列与材料身份无关。
--
-- 这里不改 V22 本身：V22 已经执行过，改动已应用的迁移会让 Flyway 校验和不符。
-- 修正以新迁移追加，先 drop 再以不带 if not exists 的方式重建，确保新口径真的生效。

-- 1. 归档旧索引放行、但新口径下属于重复的行。
--    V22 已经清理过一遍，但旧索引仍允许「同名称同规格同品牌同单位、仅地区或有效期不同」
--    的行在这段时间里被写入，因此这里必须再清一次，否则下面的唯一索引会建不起来。
create table if not exists material_quotes_archive (
    like material_quotes including defaults
);

insert into material_quotes_archive
    select * from material_quotes
    where id in (
        select id from (
            select id,
                   row_number() over (
                       partition by company_id, lower(btrim(name)), lower(btrim(specification)),
                                    lower(btrim(coalesce(brand, ''))), lower(btrim(unit))
                       order by updated_at desc, id
                   ) as rn
            from material_quotes
        ) ranked
        where rn > 1
    )
    on conflict do nothing;

delete from material_quotes
where id in (select id from material_quotes_archive);

-- 2. 换索引。drop 必须带 if exists 以便在干净的库上可重放；
--    随后的 create 故意**不带** if not exists —— 如果这里还能撞上同名残留，
--    宁可让迁移失败暴露问题，也不要再一次静默跳过。
drop index if exists material_quotes_natural_key_idx;

-- 决策 9 的自然键：企业 + 名称 + 规格 + 品牌 + 单位，全部去首尾空白后比较、忽略大小写。
-- 品牌可为空，null 与空串视为同一个值。
create unique index material_quotes_natural_key_idx
    on material_quotes (company_id, lower(btrim(name)), lower(btrim(specification)),
                        lower(btrim(coalesce(brand, ''))), lower(btrim(unit)));
