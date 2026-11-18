alter table certification_payment_orders
    add column proof_asset_id uuid,
    add column payer_note varchar(500),
    add column proof_submitted_at timestamptz,
    add column payment_reference varchar(120),
    add constraint certification_payment_orders_proof_asset_fk
        foreign key (company_id, proof_asset_id) references business_assets(company_id, id);

create index certification_payment_orders_proof_asset_idx
    on certification_payment_orders(company_id, proof_asset_id)
    where proof_asset_id is not null;
