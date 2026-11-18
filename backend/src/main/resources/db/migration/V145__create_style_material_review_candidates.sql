create table style_material_review_candidates (
    id uuid primary key,
    candidate_key varchar(180) not null unique,
    style_key varchar(40) not null,
    style_name varchar(80) not null,
    name varchar(160) not null,
    category varchar(80) not null,
    confidence numeric(4,3) not null default 0,
    source_images jsonb not null default '[]'::jsonb,
    source_rooms jsonb not null default '[]'::jsonb,
    brand varchar(120),
    specification varchar(240),
    unit varchar(40),
    price numeric(14,2),
    status varchar(20) not null default 'NEEDS_REVIEW',
    review_note varchar(1000),
    reviewed_by uuid,
    reviewed_at timestamptz,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp,
    constraint style_material_review_status_ck check (status in ('NEEDS_REVIEW', 'APPROVED', 'REJECTED')),
    constraint style_material_review_confidence_ck check (confidence >= 0 and confidence <= 1),
    constraint style_material_review_price_ck check (price is null or price >= 0)
);

create index style_material_review_style_idx on style_material_review_candidates(style_key, status, updated_at desc);
create index style_material_review_status_idx on style_material_review_candidates(status, updated_at desc);
