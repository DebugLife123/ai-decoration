create table personal_credit_accounts (
    user_id uuid primary key references auth_users(id) on delete cascade,
    balance bigint not null default 0 check (balance >= 0),
    version integer not null default 0 check (version >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table personal_credit_operations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth_users(id) on delete cascade,
    operation_key varchar(160) not null,
    units bigint not null check (units > 0),
    status varchar(16) not null check (status in ('RESERVED', 'COMMITTED', 'REFUNDED')),
    reference_id uuid,
    created_at timestamptz not null default now(),
    finalized_at timestamptz,
    unique (user_id, operation_key)
);

create index personal_credit_operations_user_created_idx
    on personal_credit_operations(user_id, created_at desc, id);

create table personal_credit_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth_users(id) on delete cascade,
    operation_id uuid references personal_credit_operations(id) on delete set null,
    delta bigint not null check (delta <> 0),
    balance_after bigint not null check (balance_after >= 0),
    event_type varchar(24) not null check (event_type in ('ADMIN_GRANT', 'GENERATION_RESERVE', 'GENERATION_REFUND')),
    note varchar(240),
    created_at timestamptz not null default now()
);

create index personal_credit_ledger_user_created_idx
    on personal_credit_ledger(user_id, created_at desc, id);
