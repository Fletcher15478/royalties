-- Millie’s royalties reporting schema
-- Run in Supabase SQL editor.

create table if not exists public.franchises (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null,
  entity_name text not null,
  region text,
  royalty_percentage double precision not null,
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  franchise_id uuid not null references public.franchises(id) on delete cascade,
  name text not null,
  type text not null check (type in ('shop', 'truck')),
  square_location_id text not null unique,
  flat_fee numeric(12,2) not null default 0,
  active boolean not null default true
);

create table if not exists public.royalty_reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  net_sales numeric(12,2) not null,
  royalty_amount numeric(12,2) not null,
  flat_fee numeric(12,2) not null,
  total_due numeric(12,2) not null,
  -- extra for dashboard/email breakdowns (orders, gross, discounts, refunds, delivery, gift cards, etc.)
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(location_id, week_start, week_end)
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.royalty_reports(id) on delete cascade,
  sent_to text not null,
  status text not null check (status in ('sent', 'failed')),
  timestamp timestamptz not null default now(),
  error text
);

-- RLS
alter table public.franchises enable row level security;
alter table public.locations enable row level security;
alter table public.royalty_reports enable row level security;
alter table public.email_logs enable row level security;

-- Admin read access (requires JWT claim: role=admin in app_metadata)
create policy "admin read franchises"
  on public.franchises for select
  to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy "admin read locations"
  on public.locations for select
  to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy "admin read royalty_reports"
  on public.royalty_reports for select
  to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy "admin read email_logs"
  on public.email_logs for select
  to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

