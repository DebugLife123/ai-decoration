alter table auth_users drop constraint auth_users_account_role_check;

alter table auth_users add constraint auth_users_account_role_check
    check ((account_type = 'BUSINESS' and company_id is not null and role in ('COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER'))
        or (account_type = 'PERSONAL' and company_id is null and role in ('PERSONAL_USER', 'PLATFORM_ADMIN', 'RESELLER_ADMIN')));

alter table reseller_partners
    add column owner_user_id uuid unique references auth_users(id) on delete set null;
