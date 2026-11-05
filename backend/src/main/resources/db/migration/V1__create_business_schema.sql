create table projects (
    id uuid primary key,
    name varchar(160) not null,
    space_type varchar(80) not null,
    style varchar(40) not null,
    budget numeric(14, 2),
    area numeric(10, 2),
    city varchar(80),
    status varchar(32) not null,
    thumbnail_url text,
    floor_plan_url text,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table project_photos (
    project_id uuid not null references projects(id) on delete cascade,
    photo_url text not null,
    primary key (project_id, photo_url)
);

create table materials (
    id uuid primary key,
    name varchar(160) not null,
    specification varchar(240) not null,
    unit varchar(40) not null,
    price varchar(80) not null,
    category varchar(80) not null,
    region varchar(80) not null,
    valid_until date not null,
    updated_at timestamptz not null
);

create index projects_status_idx on projects(status);
create index materials_region_category_idx on materials(region, category);
