create table if not exists public.app_stats (
  id boolean primary key default true,
  total_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint app_stats_singleton check (id)
);

create table if not exists public.witness_countries (
  code text primary key,
  name text not null,
  topo_id integer not null unique,
  longitude double precision not null,
  latitude double precision not null,
  count bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.witness_events (
  id bigserial primary key,
  country_code text not null references public.witness_countries(code),
  country_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.email_signups (
  id bigserial primary key,
  email text not null unique,
  country_code text,
  country_name text,
  witness_number text,
  created_at timestamptz not null default now(),
  constraint email_signups_valid_email check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

insert into public.app_stats (id, total_count)
values (true, 1563255)
on conflict (id) do nothing;

insert into public.witness_countries
  (code, name, topo_id, longitude, latitude, count)
values
  ('PT', 'Portugal', 620, -8.2, 39.5, 184211),
  ('BR', 'Brazil', 76, -52, -10, 171904),
  ('IN', 'India', 356, 78.9, 22, 140002),
  ('US', 'United States', 840, -98.5, 39.8, 132881),
  ('PK', 'Pakistan', 586, 69.3, 30.3, 98504),
  ('GB', 'United Kingdom', 826, -2.5, 54, 87510),
  ('AR', 'Argentina', 32, -64, -34, 84872),
  ('ES', 'Spain', 724, -3.7, 40.3, 79244),
  ('MA', 'Morocco', 504, -6, 32, 69301),
  ('FR', 'France', 250, 2.2, 46.2, 67220),
  ('SA', 'Saudi Arabia', 682, 45, 24, 58840),
  ('NG', 'Nigeria', 566, 8, 9, 55210),
  ('DE', 'Germany', 276, 10.4, 51.1, 53414),
  ('MX', 'Mexico', 484, -102, 23, 50230),
  ('JP', 'Japan', 392, 138, 37, 44720),
  ('ZA', 'South Africa', 710, 24, -29, 40116),
  ('ID', 'Indonesia', 360, 113, -2, 38902),
  ('EG', 'Egypt', 818, 30, 27, 37220),
  ('IT', 'Italy', 380, 12.5, 42.8, 35544),
  ('CA', 'Canada', 124, -106, 57, 33410)
on conflict (code) do update set
  name = excluded.name,
  topo_id = excluded.topo_id,
  longitude = excluded.longitude,
  latitude = excluded.latitude;

create or replace function public.record_witness(
  p_country_code text,
  p_country_name text
)
returns table (
  witness_number bigint,
  total_count bigint,
  country_code text,
  country_name text,
  country_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(coalesce(nullif(trim(p_country_code), ''), 'UN'));
  normalized_name text := coalesce(nullif(trim(p_country_name), ''), 'Unknown');
  next_total bigint;
  next_country_count bigint;
begin
  insert into public.witness_countries
    (code, name, topo_id, longitude, latitude, count)
  values
    (normalized_code, normalized_name, 999000 + abs(hashtext(normalized_code) % 999), 0, 0, 0)
  on conflict (code) do update set
    name = excluded.name,
    updated_at = now();

  update public.app_stats
  set total_count = total_count + 1,
      updated_at = now()
  where id = true
  returning public.app_stats.total_count into next_total;

  update public.witness_countries
  set count = count + 1,
      updated_at = now()
  where code = normalized_code
  returning public.witness_countries.count into next_country_count;

  insert into public.witness_events (country_code, country_name)
  values (normalized_code, normalized_name);

  return query
  select
    next_total,
    next_total,
    normalized_code,
    normalized_name,
    next_country_count;
end;
$$;

alter table public.app_stats enable row level security;
alter table public.witness_countries enable row level security;
alter table public.witness_events enable row level security;
alter table public.email_signups enable row level security;

drop policy if exists "Read app stats" on public.app_stats;
create policy "Read app stats"
on public.app_stats for select
to anon, authenticated
using (true);

drop policy if exists "Read countries" on public.witness_countries;
create policy "Read countries"
on public.witness_countries for select
to anon, authenticated
using (true);

drop policy if exists "Read recent events" on public.witness_events;
create policy "Read recent events"
on public.witness_events for select
to anon, authenticated
using (true);

drop policy if exists "Collect email signups" on public.email_signups;
create policy "Collect email signups"
on public.email_signups for insert
to anon, authenticated
with check (true);

grant usage on schema public to anon, authenticated;
grant select on public.app_stats to anon, authenticated;
grant select on public.witness_countries to anon, authenticated;
grant select on public.witness_events to anon, authenticated;
grant insert on public.email_signups to anon, authenticated;
grant usage, select on sequence public.email_signups_id_seq to anon, authenticated;
grant execute on function public.record_witness(text, text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'app_stats'
    ) then
      alter publication supabase_realtime add table public.app_stats;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'witness_countries'
    ) then
      alter publication supabase_realtime add table public.witness_countries;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'witness_events'
    ) then
      alter publication supabase_realtime add table public.witness_events;
    end if;
  end if;
end $$;
