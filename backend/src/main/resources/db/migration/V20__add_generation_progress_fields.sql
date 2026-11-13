alter table generation_tasks
    add column stage varchar(48) not null default 'queued',
    add column progress integer not null default 0 check (progress between 0 and 100),
    add column progress_message varchar(500),
    add column completed_rooms integer not null default 0 check (completed_rooms >= 0),
    add column total_rooms integer not null default 0 check (total_rooms >= 0);

create index generation_tasks_progress_idx
    on generation_tasks(owner_id, project_id, created_at)
    where status in ('QUEUED', 'RUNNING');
