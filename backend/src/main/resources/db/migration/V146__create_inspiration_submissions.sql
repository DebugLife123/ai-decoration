create table inspiration_submissions (
    id uuid primary key,
    owner_id uuid not null references auth_users(id) on delete cascade,
    title varchar(160) not null,
    style varchar(80) not null,
    description varchar(2000),
    area numeric(10,2),
    status varchar(16) not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
    review_note varchar(1000),
    reviewed_by uuid references auth_users(id),
    reviewed_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create index inspiration_submissions_owner_idx on inspiration_submissions(owner_id, updated_at desc);
create index inspiration_submissions_public_idx on inspiration_submissions(status, updated_at desc);

create table inspiration_submission_images (
    id uuid primary key,
    submission_id uuid not null references inspiration_submissions(id) on delete cascade,
    owner_id uuid not null references auth_users(id) on delete cascade,
    file_name varchar(255) not null,
    object_key text not null,
    media_type varchar(120) not null,
    byte_size bigint not null check (byte_size > 0),
    position integer not null check (position >= 0),
    created_at timestamptz not null,
    unique (submission_id, position)
);

create index inspiration_submission_images_submission_idx on inspiration_submission_images(submission_id, position);
