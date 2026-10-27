-- Persistência dos dados exibidos na tela Configurações > Empresa.
-- Execute uma vez no Supabase SQL Editor antes de publicar a versão que usa esta tabela.

create table if not exists public.company_settings (
  id text primary key default 'company' check (id = 'company'),
  company_name text not null default 'MG Refrigeração',
  cnpj text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;

drop policy if exists company_settings_authenticated_select on public.company_settings;
create policy company_settings_authenticated_select
on public.company_settings
for select
to authenticated
using (id = 'company');

drop policy if exists company_settings_authenticated_insert on public.company_settings;
create policy company_settings_authenticated_insert
on public.company_settings
for insert
to authenticated
with check (id = 'company');

drop policy if exists company_settings_authenticated_update on public.company_settings;
create policy company_settings_authenticated_update
on public.company_settings
for update
to authenticated
using (id = 'company')
with check (id = 'company');

insert into public.company_settings (
  id,
  company_name,
  cnpj,
  phone,
  email,
  address
)
values (
  'company',
  'MG Refrigeração',
  '69.487.236/0001-09',
  '(85) 98932-3113',
  'matheuslegend10@icloud.com',
  'Rua Francisco Calaça, 1688 — Fortaleza/CE — CEP 60.336-232'
)
on conflict (id) do nothing;
