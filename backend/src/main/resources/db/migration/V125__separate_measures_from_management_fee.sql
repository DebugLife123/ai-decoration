-- 预算模型 v7：措施费不再混含管理费。
-- 管理费由 BudgetEstimateService 单列为直接费的 10%；措施项本体保留清运、保护、上楼等。
update budget_reference_bands
set low_per_sqm = 40.00,
    high_per_sqm = 80.00,
    note = '建安七：成品保护、垃圾清运、上楼、防开裂等措施费（管理费另计）'
where item_key = 'MEASURES';
