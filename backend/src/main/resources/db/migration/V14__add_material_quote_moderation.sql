alter table material_quotes
    add column admin_hidden boolean not null default false,
    add column admin_hidden_reason varchar(500);

create index material_quotes_admin_visibility_idx
    on material_quotes(admin_hidden, valid_until, updated_at desc);
