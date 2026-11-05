create table company_style_profiles (
    company_id uuid primary key references auth_companies(id) on delete cascade,
    profiles jsonb not null default '[]'::jsonb,
    version integer not null default 0,
    updated_at timestamptz not null,
    check (jsonb_typeof(profiles) = 'array')
);
