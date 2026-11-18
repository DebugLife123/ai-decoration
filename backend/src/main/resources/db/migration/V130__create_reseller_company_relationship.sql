create table reseller_partners (
    id uuid primary key default gen_random_uuid(),
    code varchar(64) not null unique,
    name varchar(160) not null,
    contact_name varchar(120),
    contact_info varchar(200),
    status varchar(16) not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table company_reseller_links (
    company_id uuid primary key references auth_companies(id) on delete cascade,
    reseller_id uuid not null references reseller_partners(id) on delete restrict,
    assigned_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index company_reseller_links_reseller_idx
    on company_reseller_links(reseller_id, updated_at desc, company_id);
