create table material_quote_styles (
    quote_id uuid not null references material_quotes(id) on delete cascade,
    style_key varchar(40) not null references design_style_prompts(style_key) on delete cascade,
    position integer not null default 0,
    primary key (quote_id, style_key)
);

create index material_quote_styles_style_idx on material_quote_styles(style_key, quote_id);
