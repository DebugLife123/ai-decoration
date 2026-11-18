create table saas_orders (
    id uuid primary key default gen_random_uuid(),
    order_no varchar(40) not null unique,
    company_id uuid not null references auth_companies(id) on delete cascade,
    plan_id uuid not null references saas_plans(id),
    idempotency_key varchar(120) not null,
    amount_cents bigint not null check (amount_cents >= 0),
    status varchar(16) not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELLED')),
    payment_channel varchar(16) not null default 'SANDBOX' check (payment_channel in ('SANDBOX', 'WECHAT', 'ALIPAY')),
    created_at timestamptz not null default now(),
    paid_at timestamptz,
    updated_at timestamptz not null default now()
);

create index saas_orders_company_created_idx on saas_orders(company_id, created_at desc);
create index saas_orders_pending_idx on saas_orders(status, created_at) where status = 'PENDING';
create unique index saas_orders_company_idempotency_idx on saas_orders(company_id, idempotency_key);
