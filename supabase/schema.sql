-- EcoTrack ATU — схема БД для пилота (Supabase / PostgreSQL 15 + Row Level Security).
-- В MVP хакатона данные хранятся в браузере; этот файл описывает перенос того же контракта API на сервер.
-- Пароли хранит Supabase Auth (bcrypt); права проверяются политиками RLS на сервере.

create type org_type as enum ('department','canteen','cafe','hotel','buffet','lab');
create type user_role as enum ('resp','reviewer','admin','mgmt');
create type report_status as enum ('draft','submitted','in_review','accepted','returned');
create type disposal_mode as enum ('landfill','recycle','compost','feed');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null, short text, type org_type not null, building text,
  active boolean not null default true, created_at timestamptz default now()
);

create table profiles (                       -- 1:1 с auth.users
  id uuid primary key references auth.users on delete cascade,
  full_name text not null, email text not null unique,
  role user_role not null, org_id uuid references organizations,
  active boolean not null default true,
  constraint resp_has_org check (role <> 'resp' or org_id is not null)
);

create table disposal_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, mode disposal_mode not null default 'landfill', active boolean default true
);

create table waste_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations,       -- null = общий справочник
  name text not null, unit text not null check (unit in ('kg','l')), density numeric not null default 1,
  category text not null default 'food', recyclable boolean not null default false,
  co2 numeric not null default 0.7,           -- кг CO2-экв/кг при захоронении
  method_id uuid references disposal_methods, max_qty numeric not null default 200,
  active boolean not null default true, unique (org_id, name)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations, period char(7) not null,   -- YYYY-MM
  status report_status not null default 'draft',
  submitted_at timestamptz, reviewer_id uuid references profiles, decided_at timestamptz,
  unique (org_id, period)
);

create table entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports on delete restrict,
  org_id uuid not null references organizations,
  date date not null check (date <= current_date),
  type_id uuid not null references waste_types on delete restrict,   -- удаление вида с записями запрещено
  qty numeric not null check (qty > 0),
  method_id uuid not null references disposal_methods,
  user_id uuid not null references profiles,
  photo_url text, note text, created_at timestamptz default now(), updated_at timestamptz
);

create table status_history (
  id bigserial primary key,
  report_id uuid not null references reports on delete cascade,
  from_status report_status, to_status report_status, action text not null,
  user_id uuid references profiles, comment text, at timestamptz default now()
);

-- Единый реестр = записи принятых отчётов
create view registry as
  select e.* from entries e join reports r on r.id = e.report_id where r.status = 'accepted';

-- ---------- RLS ----------
create or replace function my_role() returns user_role language sql stable security definer as
  $$ select role from profiles where id = auth.uid() and active $$;
create or replace function my_org() returns uuid language sql stable security definer as
  $$ select org_id from profiles where id = auth.uid() $$;

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table waste_types enable row level security;
alter table disposal_methods enable row level security;
alter table reports enable row level security;
alter table entries enable row level security;
alter table status_history enable row level security;

create policy org_read on organizations for select using (auth.uid() is not null);
create policy org_admin on organizations for all using (my_role() = 'admin');
create policy prof_self on profiles for select using (id = auth.uid() or my_role() = 'admin');
create policy prof_admin on profiles for all using (my_role() = 'admin');
create policy dm_read on disposal_methods for select using (auth.uid() is not null);
create policy dm_admin on disposal_methods for all using (my_role() = 'admin');
create policy wt_read on waste_types for select using (my_role() <> 'resp' or org_id = my_org() or org_id is null);
create policy wt_resp_add on waste_types for insert with check (my_role() = 'resp' and org_id = my_org());
create policy wt_staff on waste_types for all using (my_role() in ('reviewer','admin'));

-- ответственное лицо видит только свою организацию; остальные роли — всё
create policy rep_read on reports for select using (my_role() <> 'resp' or org_id = my_org());
create policy ent_read on entries for select using (my_role() <> 'resp' or org_id = my_org());
create policy hist_read on status_history for select using (
  my_role() <> 'resp' or exists (select 1 from reports r where r.id = report_id and r.org_id = my_org()));
-- записи меняются только в черновике / возвращённом отчёте своей организации
create policy ent_write on entries for all using (
  my_role() = 'resp' and org_id = my_org()
  and exists (select 1 from reports r where r.id = report_id and r.status in ('draft','returned'))
) with check (my_role() = 'resp' and org_id = my_org() and user_id = auth.uid());

-- ---------- Переходы статусов: только через функции ----------
create or replace function submit_report(p_report uuid) returns void language plpgsql security definer as $$
declare r reports;
begin
  select * into r from reports where id = p_report for update;
  if my_role() <> 'resp' or r.org_id <> my_org() then raise exception 'forbidden'; end if;
  if r.status not in ('draft','returned') then raise exception 'wrong state'; end if;
  if not exists (select 1 from entries where report_id = p_report) then raise exception 'empty report'; end if;
  update reports set status = 'submitted', submitted_at = now() where id = p_report;
  insert into status_history(report_id, from_status, to_status, action, user_id) values (p_report, r.status, 'submitted', 'submit', auth.uid());
end $$;

create or replace function decide_report(p_report uuid, p_accept boolean, p_comment text) returns void language plpgsql security definer as $$
declare r reports; new_status report_status;
begin
  select * into r from reports where id = p_report for update;
  if my_role() not in ('reviewer','admin') then raise exception 'forbidden'; end if;
  if r.status not in ('submitted','in_review') then raise exception 'wrong state'; end if;
  if not p_accept and coalesce(trim(p_comment), '') = '' then raise exception 'comment required'; end if;
  new_status := case when p_accept then 'accepted' else 'returned' end;
  update reports set status = new_status, reviewer_id = auth.uid(), decided_at = now() where id = p_report;
  insert into status_history(report_id, from_status, to_status, action, user_id, comment)
    values (p_report, r.status, new_status, case when p_accept then 'accept' else 'return' end, auth.uid(), p_comment);
end $$;
