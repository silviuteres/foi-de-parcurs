-- Norma – foi de parcurs: schema inițială
-- Fiecare firmă client își vede doar datele proprii (Row Level Security).
-- Creditele sunt ținute într-un registru (credit_ledger) cu coloana `app`,
-- ca același cont să poată fi folosit și de alte aplicații Norma.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Firme și membri
-- ---------------------------------------------------------------
create type member_role as enum ('admin', 'contabil', 'sofer');

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  cui text,
  reg_com text,
  address text,
  approved_by text,
  created_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  job_title text,
  license_no text,
  created_at timestamptz not null default now()
);

create table memberships (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'sofer',
  driver_id uuid references drivers(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

-- ---------------------------------------------------------------
-- Evidența pe mașină
-- ---------------------------------------------------------------
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plate text not null,
  make text,
  fuel text not null default 'Motorină',
  consumption numeric(6,2) not null check (consumption >= 0), -- l/100 km
  km_initial numeric(10,1) not null default 0,
  default_driver_id uuid references drivers(id) on delete set null,
  active boolean not null default true,  -- o mașină activă consumă 1 credit/lună
  created_at timestamptz not null default now(),
  unique (company_id, plate)
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  city text,
  default_purpose text,
  is_hq boolean not null default false,
  created_at timestamptz not null default now()
);

create table distances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  loc_a uuid not null references locations(id) on delete cascade,
  loc_b uuid not null references locations(id) on delete cascade,
  km numeric(8,1) not null check (km > 0),
  check (loc_a <> loc_b)
);
-- o singură distanță pe pereche, indiferent de sens
create unique index distances_pair_idx on distances(company_id, least(loc_a, loc_b), greatest(loc_a, loc_b));

create table trips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  trip_date date not null,
  time_start time,
  time_end time,
  from_loc uuid references locations(id) on delete set null,
  to_loc uuid references locations(id) on delete set null,
  round_trip boolean not null default true,
  route_text text,          -- traseu liber (ex. deplasări locale)
  purpose text,
  km_start numeric(10,1) not null,
  km_end numeric(10,1) not null,
  generated boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (km_end >= km_start)
);
create index trips_vehicle_date_idx on trips(vehicle_id, trip_date);

create table refuels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  refuel_date date not null,
  liters numeric(8,2) not null check (liters > 0),
  amount numeric(10,2),
  doc_no text,
  created_at timestamptz not null default now()
);
create index refuels_vehicle_date_idx on refuels(vehicle_id, refuel_date);

-- Antetul foii lunare: număr, șofer principal, stoc inițial
create table sheets (
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  company_id uuid not null references companies(id) on delete cascade,
  number text,
  driver_id uuid references drivers(id) on delete set null,
  fuel_start numeric(8,2),
  primary key (vehicle_id, month)
);

-- ---------------------------------------------------------------
-- Credite, pachete, plăți
-- ---------------------------------------------------------------
create table credit_packages (
  code text primary key,               -- starter / premium / ultra
  name text not null,
  credits int not null check (credits > 0),
  price_ron numeric(10,2),             -- prețul se stabilește mai târziu (null = indisponibil)
  active boolean not null default true,
  sort int not null default 0
);
insert into credit_packages(code, name, credits, sort) values
  ('starter', 'Starter', 10, 1),
  ('premium', 'Premium', 50, 2),
  ('ultra',   'Ultra',  100, 3);

create table credit_ledger (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  app text not null default 'foi-de-parcurs',
  delta int not null,                   -- + cumpărare/probă, − consum
  reason text not null check (reason in ('proba','cumparare','consum','rambursare','ajustare')),
  vehicle_id uuid references vehicles(id) on delete set null,
  month text,
  payment_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index credit_ledger_company_idx on credit_ledger(company_id);

-- O mașină plătită într-o lună (o singură dată pe lună)
create table vehicle_months (
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vehicle_id, month)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  package_code text not null references credit_packages(code),
  credits int not null,
  amount_ron numeric(10,2) not null,
  status text not null default 'in_asteptare' check (status in ('in_asteptare','platita','esuata','anulata')),
  provider text not null default 'netopia',
  provider_ref text,
  invoice_series text,
  invoice_number text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- ---------------------------------------------------------------
-- Funcții ajutătoare pentru reguli de acces
-- ---------------------------------------------------------------
create or replace function is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from memberships where company_id = cid and user_id = auth.uid());
$$;

create or replace function has_role(cid uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from memberships where company_id = cid and user_id = auth.uid() and role = any(roles));
$$;

create or replace function credit_balance(cid uuid, p_app text default 'foi-de-parcurs') returns int
language sql stable security definer set search_path = public as $$
  -- din aplicație, soldul se vede doar pentru firma proprie
  select case when auth.uid() is not null and not is_member(cid) then 0
    else (select coalesce(sum(delta), 0)::int from credit_ledger where company_id = cid and app = p_app) end;
$$;

create or replace function vehicle_paid(vid uuid, m text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from vehicle_months where vehicle_id = vid and month = m);
$$;

-- ---------------------------------------------------------------
-- Operații cu credite (singura cale de a modifica registrul)
-- ---------------------------------------------------------------

-- Creează firma, face utilizatorul administrator și acordă creditul de probă.
create or replace function create_company(p_name text, p_cui text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Trebuie să fiți autentificat.'; end if;
  insert into companies(name, cui) values (p_name, p_cui) returning id into cid;
  insert into memberships(company_id, user_id, role) values (cid, auth.uid(), 'admin');
  insert into credit_ledger(company_id, delta, reason, note) values (cid, 1, 'proba', 'Credit gratuit la înscriere');
  return cid;
end $$;

-- Plătește o lună pentru o mașină: consumă 1 credit dacă nu e deja plătită.
-- Întoarce true dacă mașina este plătită pentru luna respectivă după apel.
-- Varianta internă, fără verificarea rolului; nu poate fi apelată din aplicație.
create or replace function _activate_vehicle_month(p_vehicle uuid, p_month text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select company_id into cid from vehicles where id = p_vehicle;
  if cid is null then raise exception 'Mașina nu există.'; end if;
  if vehicle_paid(p_vehicle, p_month) then return true; end if;
  perform pg_advisory_xact_lock(hashtext(cid::text));
  if vehicle_paid(p_vehicle, p_month) then return true; end if;
  if credit_balance(cid) < 1 then return false; end if;
  insert into vehicle_months(vehicle_id, month, company_id) values (p_vehicle, p_month, cid);
  insert into credit_ledger(company_id, delta, reason, vehicle_id, month, note)
    values (cid, -1, 'consum', p_vehicle, p_month, 'Mașină activă în ' || p_month);
  return true;
end $$;
revoke execute on function _activate_vehicle_month(uuid, text) from public, anon, authenticated;
grant execute on function _activate_vehicle_month(uuid, text) to service_role;

-- Varianta pentru aplicație: doar administratorul firmei.
create or replace function activate_vehicle_month(p_vehicle uuid, p_month text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select company_id into cid from vehicles where id = p_vehicle;
  if cid is null or not has_role(cid, array['admin']::member_role[]) then
    raise exception 'Doar administratorul firmei poate activa mașini.';
  end if;
  return _activate_vehicle_month(p_vehicle, p_month);
end $$;

-- Sarcina lunară: plătește luna pentru toate mașinile active.
-- Întoarce câte au fost plătite și câte au rămas neplătite (credite insuficiente).
create or replace function run_monthly_billing(p_month text)
returns table(paid int, unpaid int)
language plpgsql security definer set search_path = public as $$
declare v record; ok boolean; n_paid int := 0; n_unpaid int := 0;
begin
  for v in select id from vehicles where active order by company_id, created_at loop
    ok := _activate_vehicle_month(v.id, p_month);
    if ok then n_paid := n_paid + 1; else n_unpaid := n_unpaid + 1; end if;
  end loop;
  return query select n_paid, n_unpaid;
end $$;
revoke execute on function run_monthly_billing(text) from public, anon, authenticated;
grant execute on function run_monthly_billing(text) to service_role;

-- Marchează o plată ca achitată și adaugă creditele (apelată doar de server, după confirmarea procesatorului).
create or replace function confirm_payment(p_payment uuid, p_provider_ref text) returns void
language plpgsql security definer set search_path = public as $$
declare p payments;
begin
  select * into p from payments where id = p_payment for update;
  if p.id is null then raise exception 'Plata nu există.'; end if;
  if p.status = 'platita' then return; end if;
  update payments set status = 'platita', provider_ref = p_provider_ref, paid_at = now() where id = p_payment;
  insert into credit_ledger(company_id, delta, reason, payment_id, note)
    values (p.company_id, p.credits, 'cumparare', p.id, 'Pachet ' || p.package_code);
end $$;
revoke execute on function confirm_payment(uuid, text) from public, anon, authenticated;
grant execute on function confirm_payment(uuid, text) to service_role;

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
alter table companies enable row level security;
alter table memberships enable row level security;
alter table drivers enable row level security;
alter table vehicles enable row level security;
alter table locations enable row level security;
alter table distances enable row level security;
alter table trips enable row level security;
alter table refuels enable row level security;
alter table sheets enable row level security;
alter table credit_packages enable row level security;
alter table credit_ledger enable row level security;
alter table vehicle_months enable row level security;
alter table payments enable row level security;

-- Firme: membrii citesc, administratorul modifică
create policy companies_read on companies for select using (is_member(id));
create policy companies_update on companies for update using (has_role(id, array['admin']::member_role[]));

-- Membri: fiecare își vede firma; administratorul gestionează
create policy memberships_read on memberships for select using (is_member(company_id));
create policy memberships_admin on memberships for all
  using (has_role(company_id, array['admin']::member_role[]))
  with check (has_role(company_id, array['admin']::member_role[]));

-- Date de bază (șoferi, mașini, locații, distanțe): membrii citesc, administratorul scrie
create policy drivers_read on drivers for select using (is_member(company_id));
create policy drivers_admin on drivers for all using (has_role(company_id, array['admin']::member_role[])) with check (has_role(company_id, array['admin']::member_role[]));
create policy vehicles_read on vehicles for select using (is_member(company_id));
create policy vehicles_admin on vehicles for all using (has_role(company_id, array['admin']::member_role[])) with check (has_role(company_id, array['admin']::member_role[]));
create policy locations_read on locations for select using (is_member(company_id));
create policy locations_admin on locations for all using (has_role(company_id, array['admin']::member_role[])) with check (has_role(company_id, array['admin']::member_role[]));
create policy distances_read on distances for select using (is_member(company_id));
create policy distances_admin on distances for all using (has_role(company_id, array['admin']::member_role[])) with check (has_role(company_id, array['admin']::member_role[]));

-- Curse și alimentări: administratorul și șoferii scriu, doar pentru luni plătite
create policy trips_read on trips for select using (is_member(company_id));
create policy trips_write on trips for insert with check (
  has_role(company_id, array['admin','sofer']::member_role[])
  and vehicle_paid(vehicle_id, to_char(trip_date, 'YYYY-MM'))
  and exists(select 1 from vehicles v where v.id = vehicle_id and v.company_id = trips.company_id));
create policy trips_update on trips for update
  using (has_role(company_id, array['admin','sofer']::member_role[]))
  with check (has_role(company_id, array['admin','sofer']::member_role[])
    and vehicle_paid(vehicle_id, to_char(trip_date, 'YYYY-MM'))
    and exists(select 1 from vehicles v where v.id = vehicle_id and v.company_id = trips.company_id));
create policy trips_delete on trips for delete using (has_role(company_id, array['admin','sofer']::member_role[]));

create policy refuels_read on refuels for select using (is_member(company_id));
create policy refuels_write on refuels for insert with check (
  has_role(company_id, array['admin','sofer']::member_role[])
  and vehicle_paid(vehicle_id, to_char(refuel_date, 'YYYY-MM'))
  and exists(select 1 from vehicles v where v.id = vehicle_id and v.company_id = refuels.company_id));
create policy refuels_delete on refuels for delete using (has_role(company_id, array['admin','sofer']::member_role[]));

create policy sheets_read on sheets for select using (is_member(company_id));
create policy sheets_admin on sheets for all using (has_role(company_id, array['admin']::member_role[])) with check (has_role(company_id, array['admin']::member_role[]) and exists(select 1 from vehicles v where v.id = vehicle_id and v.company_id = sheets.company_id));

-- Credite: doar citire din aplicație; modificările trec prin funcțiile de mai sus
create policy packages_read on credit_packages for select using (true);
create policy ledger_read on credit_ledger for select using (is_member(company_id));
create policy vehicle_months_read on vehicle_months for select using (is_member(company_id));
create policy payments_read on payments for select using (is_member(company_id));
