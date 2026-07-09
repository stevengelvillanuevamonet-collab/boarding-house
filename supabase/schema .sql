-- ============================================================
-- Boarding House Management System — Supabase Schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New Query)
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES (extends auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null check (role in ('admin', 'tenant')) default 'tenant',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
-- Role defaults to 'tenant'; promote to 'admin' manually in the table editor.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Unnamed'),
    coalesce(new.raw_user_meta_data->>'role', 'tenant')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2. ROOMS
-- ------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  monthly_rate numeric(10,2) not null,
  status text not null check (status in ('vacant', 'occupied', 'maintenance')) default 'vacant',
  notes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. TENANCIES (a tenant's stay in a room, over time)
-- ------------------------------------------------------------
create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  move_in_date date not null,
  move_out_date date,
  status text not null check (status in ('active', 'ended')) default 'active',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. PAYMENTS (one row per tenant per billing month)
-- ------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id) on delete cascade,
  for_month date not null,          -- store as the 1st of the billing month, e.g. 2026-07-01
  amount_due numeric(10,2) not null,
  amount_paid numeric(10,2) not null default 0,
  due_date date not null,
  paid_date date,
  status text not null check (status in ('pending', 'paid', 'overdue')) default 'pending',
  created_at timestamptz not null default now(),
  unique (tenancy_id, for_month)
);

-- ------------------------------------------------------------
-- 5. HELPER: is the current user an admin?
-- ------------------------------------------------------------
create function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.tenancies enable row level security;
alter table public.payments enable row level security;

-- PROFILES: admins see everyone; tenants see only themselves
create policy "profiles_select" on public.profiles
  for select using (public.is_admin() or id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

-- ROOMS: admins manage; tenants can read (needed to show room number/rate)
create policy "rooms_admin_all" on public.rooms
  for all using (public.is_admin());
create policy "rooms_tenant_select" on public.rooms
  for select using (true);

-- TENANCIES: admins manage all; tenants see only their own
create policy "tenancies_admin_all" on public.tenancies
  for all using (public.is_admin());
create policy "tenancies_tenant_select" on public.tenancies
  for select using (tenant_id = auth.uid());

-- PAYMENTS: admins manage all; tenants see only their own (via tenancy)
create policy "payments_admin_all" on public.payments
  for all using (public.is_admin());
create policy "payments_tenant_select" on public.payments
  for select using (
    exists (
      select 1 from public.tenancies t
      where t.id = payments.tenancy_id and t.tenant_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 7. Keep payment status in sync automatically
-- ------------------------------------------------------------
create function public.sync_payment_status()
returns trigger as $$
begin
  if new.amount_paid >= new.amount_due then
    new.status := 'paid';
    if new.paid_date is null then
      new.paid_date := current_date;
    end if;
  elsif new.due_date < current_date then
    new.status := 'overdue';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_payment_status
  before insert or update on public.payments
  for each row execute procedure public.sync_payment_status();
