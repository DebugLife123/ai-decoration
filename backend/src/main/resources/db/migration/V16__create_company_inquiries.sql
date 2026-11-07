create table company_inquiries (
    id uuid primary key,
    company_id uuid not null references auth_companies(id) on delete cascade,
    consumer_id uuid not null references auth_users(id) on delete cascade,
    material_quote_id uuid references material_quotes(id) on delete set null,
    material_name varchar(160) not null,
    contact_name varchar(120) not null,
    contact_info varchar(160) not null,
    message varchar(2000) not null,
    status varchar(16) not null default 'NEW'
        check (status in ('NEW', 'CONTACTED', 'QUOTED', 'CLOSED')),
    version integer not null default 0 check (version >= 0),
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create index company_inquiries_company_created_idx
    on company_inquiries(company_id, created_at desc, id);
create index company_inquiries_company_status_created_idx
    on company_inquiries(company_id, status, created_at desc, id);
