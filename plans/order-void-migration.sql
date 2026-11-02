-- Voiding a cash sale that never happened (app/api/admin/orders/[orderId]/void).
-- Orders gain status 'voided'; the ledger gains reversal rows of type 'void'.
--
-- The existing check constraints (if any) aren't in the repo, so this drops
-- whatever check constraint covers orders.status / settlement_ledger.type and
-- re-adds one that keeps every value already in use plus the new one.
do $$
declare c record;
begin
  for c in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and con.contype = 'c'
      and (
        (rel.relname = 'orders' and pg_get_constraintdef(con.oid) ilike '%status%')
        or (rel.relname = 'settlement_ledger' and pg_get_constraintdef(con.oid) ilike '%type%')
      )
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'completed', 'refunded', 'failed', 'cancelled', 'voided'));

alter table public.settlement_ledger
  add constraint settlement_ledger_type_check
  check (type in ('sale', 'refund', 'dispute', 'comp', 'void'));
