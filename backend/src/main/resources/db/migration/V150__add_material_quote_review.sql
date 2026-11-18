alter table material_quotes
    add column review_status varchar(20) not null default 'APPROVED',
    add column review_note varchar(500),
    add column reviewed_at timestamptz,
    add column reviewed_by uuid;

alter table material_quotes
    add constraint material_quotes_review_status_check
        check (review_status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));

create index material_quotes_review_status_idx
    on material_quotes(review_status, updated_at desc);
