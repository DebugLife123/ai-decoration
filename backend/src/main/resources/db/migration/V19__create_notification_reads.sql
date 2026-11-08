create table notification_reads (
    recipient_id uuid not null,
    recipient_role varchar(40) not null,
    notification_key varchar(255) not null,
    read_at timestamptz not null,
    primary key (recipient_id, recipient_role, notification_key)
);

create index notification_reads_recipient_idx on notification_reads(recipient_id, recipient_role, read_at desc);
