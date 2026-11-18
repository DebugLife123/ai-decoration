alter table certification_payment_orders
    add column proof_status varchar(16) not null default 'NOT_SUBMITTED'
        check (proof_status in ('NOT_SUBMITTED', 'SUBMITTED', 'REJECTED')),
    add column proof_rejection_reason varchar(500),
    add column proof_reviewed_by uuid,
    add column proof_reviewed_at timestamptz;

update certification_payment_orders
set proof_status = 'SUBMITTED'
where proof_asset_id is not null and status = 'PENDING';

update certification_payment_orders
set proof_status = 'SUBMITTED'
where proof_asset_id is not null and status = 'PAID' and payment_channel = 'MANUAL';

create index certification_payment_orders_proof_review_idx
    on certification_payment_orders(proof_status, proof_submitted_at, id)
    where status = 'PENDING';
