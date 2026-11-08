create table admin_audit_logs (
    id uuid primary key,
    actor_id uuid not null,
    action varchar(40) not null,
    target_type varchar(40) not null,
    target_id uuid,
    description varchar(500) not null,
    created_at timestamptz not null
);

create index admin_audit_logs_created_idx on admin_audit_logs(created_at desc, id desc);
create index admin_audit_logs_actor_idx on admin_audit_logs(actor_id, created_at desc);
