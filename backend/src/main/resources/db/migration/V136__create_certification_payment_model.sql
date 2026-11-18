create table certification_fee_config (
    config_key varchar(32) primary key,
    amount_cents bigint not null check (amount_cents >= 0 and amount_cents <= 100000000),
    updated_by uuid,
    updated_at timestamptz not null default now()
);

insert into certification_fee_config(config_key, amount_cents)
values ('DEFAULT', 29900);

create table certification_payment_orders (
    id uuid primary key default gen_random_uuid(),
    order_no varchar(48) not null unique,
    company_id uuid not null references auth_companies(id) on delete cascade,
    idempotency_key varchar(160) not null,
    amount_cents bigint not null check (amount_cents >= 0),
    status varchar(16) not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELLED')),
    payment_channel varchar(16) not null default 'MANUAL' check (payment_channel in ('MANUAL', 'LEGACY')),
    note varchar(500),
    confirmed_by uuid,
    created_at timestamptz not null default now(),
    paid_at timestamptz,
    updated_at timestamptz not null default now(),
    unique (company_id, idempotency_key)
);

create unique index certification_payment_orders_pending_company_idx
    on certification_payment_orders(company_id) where status = 'PENDING';

create index certification_payment_orders_status_created_idx
    on certification_payment_orders(status, created_at, id);

insert into certification_payment_orders(
    id, order_no, company_id, idempotency_key, amount_cents, status,
    payment_channel, note, created_at, paid_at, updated_at
)
select gen_random_uuid(), 'LEGACY-' || upper(replace(c.company_id::text, '-', '')), c.company_id,
       'legacy-certification', 0, 'PAID', 'LEGACY', 'V36 升级前已提交认证，保留认证资格',
       c.submitted_at, c.submitted_at, now()
from company_certifications c
on conflict (company_id, idempotency_key) do nothing;
