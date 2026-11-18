create table saas_usage_ledger (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid not null references company_subscriptions(id) on delete cascade,
    company_id uuid not null references auth_companies(id) on delete cascade,
    usage_type varchar(32) not null check (usage_type in ('AI_GENERATION', 'STORAGE_BYTES')),
    units bigint not null check (units > 0),
    reference_id uuid,
    idempotency_key varchar(160) not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (subscription_id, idempotency_key)
);

create index saas_usage_ledger_company_created_idx
    on saas_usage_ledger(company_id, usage_type, created_at desc, id);
