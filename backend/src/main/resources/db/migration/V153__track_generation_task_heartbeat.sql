-- Track when a browser-driven task last reported progress so runs abandoned by a
-- closed tab (or a stalled gateway) stop looking "generating" forever.
alter table generation_tasks add column heartbeat_at timestamptz;

update generation_tasks set heartbeat_at = coalesce(started_at, created_at);

create index generation_tasks_running_heartbeat_idx
    on generation_tasks(heartbeat_at)
    where status in ('QUEUED', 'RUNNING');
