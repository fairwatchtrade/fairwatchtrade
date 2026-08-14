-- Appearance preference (v4.58 appearance foundation).
-- NULL = System (no override). Only an explicit override is stored, so the
-- absence of a choice never masquerades as one.
alter table public.profiles
  add column if not exists appearance text
  check (appearance is null or appearance in ('light', 'dark'));
