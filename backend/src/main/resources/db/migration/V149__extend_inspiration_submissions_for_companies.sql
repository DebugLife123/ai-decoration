alter table inspiration_submissions
    add column submitter_type varchar(16) not null default 'PERSONAL'
        check (submitter_type in ('PERSONAL', 'BUSINESS')),
    add column company_id uuid references auth_companies(id) on delete cascade;

alter table inspiration_submissions
    add constraint inspiration_submission_company_scope_check
        check ((submitter_type = 'PERSONAL' and company_id is null)
            or (submitter_type = 'BUSINESS' and company_id is not null));

create index inspiration_submissions_company_idx
    on inspiration_submissions(company_id, updated_at desc)
    where company_id is not null;

create table inspiration_submission_materials (
    submission_id uuid not null references inspiration_submissions(id) on delete cascade,
    quote_id uuid not null references material_quotes(id) on delete cascade,
    position integer not null check (position >= 0),
    primary key (submission_id, quote_id),
    unique (submission_id, position)
);

create index inspiration_submission_materials_quote_idx
    on inspiration_submission_materials(quote_id);
