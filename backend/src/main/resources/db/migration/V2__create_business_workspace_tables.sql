create table company_profiles (
    company_id uuid primary key,
    id uuid not null unique,
    name varchar(160) not null,
    city varchar(80),
    services varchar(500),
    intro varchar(2000),
    version integer not null default 0,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table business_cases (
    id uuid primary key,
    company_id uuid not null,
    title varchar(160) not null,
    area numeric(10, 2),
    style varchar(80),
    budget numeric(14, 2),
    status varchar(16) not null default 'draft' check (status in ('draft', 'published')),
    version integer not null default 0,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    unique (company_id, id)
);

create index business_cases_company_updated_idx on business_cases(company_id, updated_at desc, id);
create index business_cases_company_status_idx on business_cases(company_id, status, updated_at desc, id);

create table business_assets (
    company_id uuid not null,
    id uuid not null,
    file_name varchar(255) not null,
    object_key text not null,
    created_at timestamptz not null,
    primary key (company_id, id)
);

create table business_case_files (
    company_id uuid not null,
    case_id uuid not null references business_cases(id) on delete cascade,
    file_id uuid not null,
    position integer not null,
    primary key (case_id, file_id),
    unique (case_id, position),
    foreign key (company_id, case_id) references business_cases(company_id, id) on delete cascade,
    foreign key (company_id, file_id) references business_assets(company_id, id)
);

create table material_quotes (
    id uuid primary key,
    company_id uuid not null,
    name varchar(160) not null,
    specification varchar(240) not null,
    unit varchar(40) not null,
    price numeric(14, 2) not null check (price > 0),
    category varchar(80) not null,
    region varchar(80) not null,
    valid_until date not null,
    version integer not null default 0,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create unique index material_quotes_natural_key_idx on material_quotes
    (company_id, lower(trim(name)), lower(trim(specification)), lower(trim(unit)), lower(trim(region)), valid_until);
create index material_quotes_company_updated_idx on material_quotes(company_id, updated_at desc, id);

create table labor_quotes (
    id uuid primary key,
    company_id uuid not null,
    labor_type varchar(160) not null,
    unit varchar(40) not null,
    price numeric(14, 2) not null check (price > 0),
    region varchar(80) not null,
    valid_until date not null,
    version integer not null default 0,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create unique index labor_quotes_natural_key_idx on labor_quotes
    (company_id, lower(trim(labor_type)), lower(trim(unit)), lower(trim(region)), valid_until);
create index labor_quotes_company_updated_idx on labor_quotes(company_id, updated_at desc, id);

create table business_idempotency_keys (
    company_id uuid not null,
    idempotency_key varchar(128) not null,
    request_hash char(64) not null,
    resource_type varchar(40) not null,
    resource_id uuid not null,
    created_at timestamptz not null,
    expires_at timestamptz not null,
    primary key (company_id, idempotency_key)
);

create index business_idempotency_expiry_idx on business_idempotency_keys(expires_at);
