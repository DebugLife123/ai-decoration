create table workspace_assets (
    owner_id uuid not null,
    project_id uuid not null,
    id uuid not null,
    original_name varchar(255) not null,
    media_type varchar(120) not null,
    byte_size bigint not null check (byte_size > 0),
    object_key text not null,
    checksum_sha256 char(64),
    created_at timestamptz not null,
    primary key (owner_id, id),
    unique (owner_id, project_id, id),
    foreign key (owner_id, project_id)
        references workspace_project_aggregates(company_id, project_id) on delete cascade
);

create index workspace_assets_project_created_idx
    on workspace_assets(owner_id, project_id, created_at, id);

create table generation_tasks (
    owner_id uuid not null,
    project_id uuid not null,
    id uuid not null,
    task_type varchar(24) not null check (task_type in ('RENDER', 'EDIT', 'RECOMMENDATION')),
    status varchar(16) not null check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    input_json jsonb not null,
    result_json jsonb,
    error_message varchar(1000),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    created_at timestamptz not null,
    started_at timestamptz,
    completed_at timestamptz,
    primary key (owner_id, id),
    unique (owner_id, project_id, id),
    foreign key (owner_id, project_id)
        references workspace_project_aggregates(company_id, project_id) on delete cascade,
    check ((status in ('SUCCEEDED', 'FAILED')) = (completed_at is not null)),
    check (status = 'QUEUED' or started_at is not null)
);

create index generation_tasks_project_created_idx
    on generation_tasks(owner_id, project_id, created_at desc, id);
create index generation_tasks_queued_idx
    on generation_tasks(created_at, id) where status = 'QUEUED';

create table project_versions (
    owner_id uuid not null,
    project_id uuid not null,
    id uuid not null,
    task_id uuid,
    version_number integer not null check (version_number > 0),
    source_version_id uuid,
    snapshot_json jsonb not null,
    created_at timestamptz not null,
    primary key (owner_id, id),
    unique (owner_id, project_id, id),
    unique (owner_id, project_id, version_number),
    foreign key (owner_id, project_id)
        references workspace_project_aggregates(company_id, project_id) on delete cascade,
    foreign key (owner_id, project_id, task_id)
        references generation_tasks(owner_id, project_id, id),
    foreign key (owner_id, project_id, source_version_id)
        references project_versions(owner_id, project_id, id)
);

create index project_versions_project_created_idx
    on project_versions(owner_id, project_id, created_at desc, version_number desc);
