alter table auth_companies
    add column is_demo boolean not null default false;

update auth_companies
set is_demo = true
where id in (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'
);

create index auth_companies_demo_idx on auth_companies(is_demo, name);
