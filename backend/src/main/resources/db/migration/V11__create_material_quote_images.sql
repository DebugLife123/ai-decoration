create unique index material_quotes_company_id_id_idx on material_quotes(company_id, id);

create table material_quote_images (
    company_id uuid not null,
    quote_id uuid not null,
    image_id uuid not null,
    position integer not null check (position >= 0 and position < 8),
    primary key (quote_id, image_id),
    unique (quote_id, position),
    foreign key (company_id, quote_id) references material_quotes(company_id, id) on delete cascade,
    foreign key (company_id, image_id) references business_assets(company_id, id)
);

insert into material_quote_images(company_id, quote_id, image_id, position)
select company_id, id, image_id, 0 from material_quotes where image_id is not null;

create index material_quote_images_asset_idx on material_quote_images(image_id);
