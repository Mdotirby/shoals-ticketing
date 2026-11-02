-- The agent's assistant: who offers and settlements are addressed to, with the
-- agent copied. The app works before this runs, but the address won't be saved.
alter table artist_offers add column if not exists agent_assistant_email text;
