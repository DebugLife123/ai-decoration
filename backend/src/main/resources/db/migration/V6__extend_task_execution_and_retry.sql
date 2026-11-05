alter table generation_tasks
    add column max_attempts integer not null default 3 check (max_attempts between 1 and 10),
    add column retry_count integer not null default 0 check (retry_count between 0 and 10),
    add column manual_retry_count integer not null default 0 check (manual_retry_count between 0 and 3),
    add column available_at timestamptz not null default now(),
    add column lease_owner varchar(120),
    add column lease_expires_at timestamptz;

create index generation_tasks_available_idx
    on generation_tasks(available_at, created_at, id)
    where status = 'QUEUED';

create table company_certifications (
    company_id uuid primary key references auth_companies(id) on delete cascade,
    id uuid not null unique,
    company_name varchar(160) not null,
    contact_name varchar(120) not null,
    contact_info varchar(160) not null,
    service_areas jsonb not null default '[]'::jsonb,
    document_refs jsonb not null default '[]'::jsonb,
    status varchar(16) not null default 'PENDING'
        check (status in ('PENDING', 'APPROVED', 'REJECTED')),
    review_note varchar(1000),
    reviewed_by uuid,
    reviewed_at timestamptz,
    version integer not null default 0,
    submitted_at timestamptz not null,
    updated_at timestamptz not null,
    check ((status = 'PENDING') = (reviewed_at is null)),
    check ((status = 'PENDING') = (reviewed_by is null))
);

create index company_certifications_status_submitted_idx
    on company_certifications(status, submitted_at);
