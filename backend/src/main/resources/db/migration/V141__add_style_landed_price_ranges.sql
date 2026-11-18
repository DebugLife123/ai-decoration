alter table budget_style_references
    add column price_low_per_sqm numeric(10,2),
    add column price_high_per_sqm numeric(10,2);

update budget_style_references
set style_name = case style_code
        when 'modern-minimal' then '现代简约'
        when 'wood-cream' then '原木奶油'
        when 'mid-century' then '中古风'
        when 'bauhaus' then '包豪斯'
        when 'small-american' then '小美风'
        when 'french-natural' then '轻法式'
        when 'song' then '宋式美学'
        when 'italian-minimal' then '意式极简'
        when 'old-money' then '高配老钱轻奢风'
    end,
    price_low_per_sqm = case style_code
        when 'modern-minimal' then 1000
        when 'wood-cream' then 1000
        when 'mid-century' then 1200
        when 'bauhaus' then 1300
        when 'small-american' then 1500
        when 'french-natural' then 1400
        when 'song' then 2000
        when 'italian-minimal' then 1800
        when 'old-money' then 3000
    end,
    price_high_per_sqm = case style_code
        when 'modern-minimal' then 1500
        when 'wood-cream' then 1500
        when 'mid-century' then 1700
        when 'bauhaus' then 1800
        when 'small-american' then 2000
        when 'french-natural' then 2000
        when 'song' then 2500
        when 'italian-minimal' then 2300
        when 'old-money' then 3800
    end
where style_code in (
    'modern-minimal', 'wood-cream', 'mid-century', 'bauhaus', 'small-american',
    'french-natural', 'song', 'italian-minimal', 'old-money'
);

delete from budget_estimate_coefficients
where coefficient_group = 'STYLE'
  and coefficient_code not in (
      'modern-minimal', 'wood-cream', 'mid-century', 'bauhaus', 'small-american',
      'french-natural', 'song', 'italian-minimal', 'old-money'
  );

delete from budget_style_references
where style_code not in (
    'modern-minimal', 'wood-cream', 'mid-century', 'bauhaus', 'small-american',
    'french-natural', 'song', 'italian-minimal', 'old-money'
);

alter table budget_style_references
    alter column price_low_per_sqm set not null,
    alter column price_high_per_sqm set not null,
    add constraint budget_style_price_range_check
        check (price_low_per_sqm > 0 and price_high_per_sqm >= price_low_per_sqm);

update budget_estimate_coefficients c
set label = s.style_name
from budget_style_references s
where c.coefficient_group = 'STYLE' and c.coefficient_code = s.style_code;
