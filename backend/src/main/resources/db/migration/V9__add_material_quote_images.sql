alter table business_assets
    add column media_type varchar(120) not null default 'application/octet-stream';

alter table material_quotes
    add column image_id uuid;

alter table material_quotes
    add constraint material_quotes_image_asset_fk
    foreign key (company_id, image_id) references business_assets(company_id, id);

create index material_quotes_image_idx on material_quotes(image_id) where image_id is not null;
