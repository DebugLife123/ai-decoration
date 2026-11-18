create table saas_plans (
    id uuid primary key default gen_random_uuid(),
    code varchar(32) not null unique,
    name varchar(80) not null,
    trial_days integer not null default 0 check (trial_days >= 0),
    generation_quota integer not null default 0 check (generation_quota >= 0),
    storage_limit_bytes bigint not null default 0 check (storage_limit_bytes >= 0),
    material_limit integer not null default 0 check (material_limit >= 0),
    case_limit integer not null default 0 check (case_limit >= 0),
    monthly_price_cents bigint not null default 0 check (monthly_price_cents >= 0),
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create table company_subscriptions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null unique references auth_companies(id) on delete cascade,
    plan_id uuid not null references saas_plans(id),
    status varchar(20) not null check (status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'EXPIRED', 'CANCELLED')),
    started_at timestamptz not null,
    expires_at timestamptz not null,
    trial_ends_at timestamptz,
    version integer not null default 0 check (version >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index company_subscriptions_status_expires_idx
    on company_subscriptions(status, expires_at);

insert into saas_plans(code, name, trial_days, generation_quota, storage_limit_bytes, material_limit, case_limit, monthly_price_cents)
values
    ('TRIAL', '试用版', 14, 10, 524288000, 20, 5, 0),
    ('STANDARD', '标准版', 0, 100, 5368709120, 200, 50, 9900),
    ('PRO', '专业版', 0, 500, 21474836480, 1000, 200, 19900)
on conflict (code) do nothing;
