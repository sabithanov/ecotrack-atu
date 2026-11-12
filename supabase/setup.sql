-- EcoTrack ATU — облачная синхронизация (Supabase). Выполнить один раз: SQL Editor → New query → вставить → Run.
-- Каждая запись приложения (организация, пользователь, вид отхода, отчёт, взвешивание, история) хранится строкой
-- с JSON-данными; устройства обмениваются изменениями по updated_at.

create table if not exists public.ecotrack_records (
  collection text not null check (collection in ('meta','orgs','users','methods','wasteTypes','reports','entries','history')),
  id         text not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists ecotrack_records_updated_idx on public.ecotrack_records (updated_at);

-- время изменения ставит сервер (а не клиент)
create or replace function public.ecotrack_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists ecotrack_touch on public.ecotrack_records;
create trigger ecotrack_touch before insert or update on public.ecotrack_records
  for each row execute function public.ecotrack_touch();

-- доступ по публичному ключу: чтение, добавление, изменение; физическое удаление запрещено (удаление = deleted=true)
alter table public.ecotrack_records enable row level security;
drop policy if exists "ecotrack read"   on public.ecotrack_records;
drop policy if exists "ecotrack insert" on public.ecotrack_records;
drop policy if exists "ecotrack update" on public.ecotrack_records;
create policy "ecotrack read"   on public.ecotrack_records for select to anon, authenticated using (true);
create policy "ecotrack insert" on public.ecotrack_records for insert to anon, authenticated with check (true);
create policy "ecotrack update" on public.ecotrack_records for update to anon, authenticated using (true) with check (true);
grant select, insert, update on public.ecotrack_records to anon, authenticated;
