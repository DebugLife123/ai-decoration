alter table auth_users
    add column account_status varchar(16) not null default 'ACTIVE'
        check (account_status in ('ACTIVE', 'DISABLED', 'DELETED')),
    add column account_status_changed_at timestamptz,
    add column deleted_at timestamptz;

create index auth_users_management_idx on auth_users(account_type, account_status, created_at desc);
