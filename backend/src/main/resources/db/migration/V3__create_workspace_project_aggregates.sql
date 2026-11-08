create table workspace_project_aggregates (
    company_id uuid not null,
    project_id uuid not null,
    project_json jsonb not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    primary key (company_id, project_id)
);

create index workspace_project_aggregates_company_updated_idx
    on workspace_project_aggregates(company_id, updated_at desc, project_id);
