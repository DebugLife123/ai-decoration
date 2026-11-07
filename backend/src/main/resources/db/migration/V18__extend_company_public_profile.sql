alter table company_profiles
    add column service_areas varchar(500),
    add column business_hours varchar(240),
    add column logo_asset_id uuid,
    add column storefront_asset_id uuid;

create index company_profiles_logo_asset_idx on company_profiles(logo_asset_id)
    where logo_asset_id is not null;
create index company_profiles_storefront_asset_idx on company_profiles(storefront_asset_id)
    where storefront_asset_id is not null;
