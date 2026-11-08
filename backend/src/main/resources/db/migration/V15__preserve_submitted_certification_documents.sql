create table company_certification_documents (
    company_id uuid not null,
    asset_id uuid not null,
    submitted_at timestamptz not null,
    primary key (company_id, asset_id),
    foreign key (company_id, asset_id) references business_assets(company_id, id) on delete restrict
);

insert into company_certification_documents(company_id, asset_id, submitted_at)
select c.company_id, a.id, coalesce(c.submitted_at, a.created_at)
from company_certifications c
cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(c.document_refs) = 'array' then c.document_refs else '[]'::jsonb end
) ref
join business_assets a on a.company_id = c.company_id and a.id::text = ref.value
on conflict (company_id, asset_id) do nothing;

create index company_certification_documents_asset_idx on company_certification_documents(asset_id);
