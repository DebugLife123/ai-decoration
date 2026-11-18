create table budget_estimate_coefficients (
    coefficient_group varchar(24) not null check (coefficient_group in ('STYLE', 'MATERIAL_GRADE', 'REGION')),
    coefficient_code varchar(40) not null,
    label varchar(80) not null,
    factor numeric(5,3) not null check (factor between 0.500 and 2.000),
    updated_at timestamptz not null default now(),
    updated_by uuid references auth_users(id),
    primary key (coefficient_group, coefficient_code)
);

insert into budget_estimate_coefficients(coefficient_group, coefficient_code, label, factor)
select 'STYLE', style_code, style_name, material_factor from budget_style_references;

insert into budget_estimate_coefficients(coefficient_group, coefficient_code, label, factor) values
('MATERIAL_GRADE', 'ECONOMY', '经济型', 0.850),
('MATERIAL_GRADE', 'STANDARD', '舒适型', 1.000),
('MATERIAL_GRADE', 'PREMIUM', '品质型', 1.250),
('REGION', 'FIRST_TIER', '一线城市', 1.150),
('REGION', 'STANDARD', '普通城市', 1.000),
('REGION', 'COUNTY', '县城', 0.900);
