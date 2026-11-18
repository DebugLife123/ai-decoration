create table auth_sessions (
    id uuid primary key,
    user_id uuid not null references auth_users(id) on delete cascade,
    device_name varchar(120) not null,
    user_agent varchar(500) not null default '',
    ip_address varchar(64) not null default '',
    created_at timestamptz not null,
    last_seen_at timestamptz not null,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    check (expires_at > created_at)
);

create index auth_sessions_user_active_idx on auth_sessions(user_id, last_seen_at desc)
    where revoked_at is null;
