create table company_inquiry_events (
    id bigserial primary key,
    inquiry_id uuid not null references company_inquiries(id) on delete cascade,
    actor_type varchar(16) not null check (actor_type in ('CONSUMER', 'COMPANY', 'SYSTEM')),
    event_type varchar(24) not null check (event_type in ('CREATED', 'STATUS_CHANGED', 'REPLY')),
    status varchar(16) check (status is null or status in ('NEW', 'CONTACTED', 'QUOTED', 'CLOSED')),
    content varchar(2000),
    created_at timestamptz not null,
    check ((event_type = 'REPLY' and content is not null) or event_type <> 'REPLY')
);

create index company_inquiry_events_inquiry_created_idx
    on company_inquiry_events(inquiry_id, created_at, id);

insert into company_inquiry_events(inquiry_id, actor_type, event_type, status, created_at)
select id, 'CONSUMER', 'CREATED', status, created_at
from company_inquiries;
