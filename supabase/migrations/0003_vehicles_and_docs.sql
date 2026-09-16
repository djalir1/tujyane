-- 0003_vehicles_and_docs.sql
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  make text not null,
  model text not null,
  year integer check (year between 1980 and extract(year from now())::int + 1),
  plate_number text not null,
  color text,
  seats integer not null check (seats between 1 and 20),
  energy_type public.energy_type not null default 'petrol',
  photo_url text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, plate_number)
);

create index if not exists vehicles_owner_idx on public.vehicles (owner_id);
create index if not exists vehicles_verified_idx on public.vehicles (is_verified) where is_verified;

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  doc_type public.doc_type not null,
  file_url text not null,
  status public.doc_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_documents_driver_idx on public.driver_documents (driver_id);
create index if not exists driver_documents_status_idx on public.driver_documents (status);

drop trigger if exists driver_documents_set_updated_at on public.driver_documents;
create trigger driver_documents_set_updated_at
  before update on public.driver_documents
  for each row execute function public.set_updated_at();
