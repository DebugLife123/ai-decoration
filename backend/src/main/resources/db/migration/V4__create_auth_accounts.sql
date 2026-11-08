create table auth_companies (
    id uuid primary key,
    name varchar(160) not null,
    created_at timestamptz not null
);

create table auth_users (
    id uuid primary key,
    email varchar(320) not null,
    password_hash varchar(255) not null,
    display_name varchar(120) not null,
    account_type varchar(16) not null check (account_type in ('PERSONAL', 'BUSINESS')),
    company_id uuid references auth_companies(id) on delete cascade,
    role varchar(40) not null,
    created_at timestamptz not null,
    last_login_at timestamptz,
    check ((account_type = 'BUSINESS' and company_id is not null and role in ('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER'))
        or (account_type = 'PERSONAL' and company_id is null and role = 'PERSONAL_USER'))
);

create unique index auth_users_email_idx on auth_users(lower(trim(email)));
create index auth_users_company_idx on auth_users(company_id);
