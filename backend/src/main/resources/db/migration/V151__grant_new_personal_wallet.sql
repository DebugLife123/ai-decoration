-- Existing users are reconciled from the old ledger during release, never overwritten.
create function grant_signup_wallet() returns trigger language plpgsql as $$
begin
  if new.role = 'PERSONAL_USER' then
    insert into personal_credit_accounts(user_id,balance) values(new.id,300);
    insert into personal_credit_ledger(user_id,delta,balance_after,event_type,note)
      values(new.id,300,300,'ADMIN_GRANT','注册赠送积分');
  end if;
  return new;
end $$;
create trigger auth_user_signup_wallet after insert on auth_users for each row execute function grant_signup_wallet();
