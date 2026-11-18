-- All failure paths, including crash recovery and lease expiration, use this transition.
create function release_terminal_company_quota() returns trigger language plpgsql as $$
begin
  delete from saas_usage_ledger where company_id=new.owner_id and usage_type='AI_GENERATION'
    and idempotency_key='generation:' || new.id::text;
  return new;
end $$;
create trigger release_terminal_company_quota after update of status on generation_tasks
for each row when (new.status='FAILED' and old.status is distinct from new.status)
execute function release_terminal_company_quota();
