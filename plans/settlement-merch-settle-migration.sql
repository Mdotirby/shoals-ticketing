-- Merch paid to the promoter separately instead of out of the guarantee.
-- 'guarantee' (default) keeps today's behaviour: the venue's merch money is
-- netted out of the artist's balance due. 'cash' / 'check' means the artist
-- pays it on its own, so the balance due is the full walkout.
alter table settlements
  add column if not exists merch_settle_method text not null default 'guarantee',
  add column if not exists merch_settle_reference text;

alter table settlements drop constraint if exists settlements_merch_settle_method_check;
alter table settlements
  add constraint settlements_merch_settle_method_check
  check (merch_settle_method in ('guarantee', 'cash', 'check'));
