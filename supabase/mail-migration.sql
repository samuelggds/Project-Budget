-- Caixa de e-mail corporativa do Budget.
-- Execute uma vez no Supabase SQL Editor antes de ativar os workers AWS.

create table if not exists public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  provider_message_id text,
  thread_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  folder text not null default 'inbox' check (folder in ('inbox', 'sent', 'draft', 'archive', 'trash')),
  status text not null default 'received' check (status in ('received', 'draft', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  from_address text not null,
  from_name text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  reply_to_addresses text[] not null default '{}',
  subject text not null default '',
  text_body text,
  html_body text,
  snippet text not null default '',
  in_reply_to text,
  references text[] not null default '{}',
  s3_raw_key text,
  client_id text,
  budget_id text,
  received_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mail_messages_folder_date_idx
  on public.mail_messages (folder, coalesce(received_at, sent_at, created_at) desc);
create index if not exists mail_messages_thread_idx
  on public.mail_messages (thread_id, created_at);
create index if not exists mail_messages_provider_idx
  on public.mail_messages (provider_message_id)
  where provider_message_id is not null;

create table if not exists public.mail_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.mail_messages(id) on delete cascade,
  filename text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  s3_key text not null unique,
  is_inline boolean not null default false,
  content_id text,
  created_at timestamptz not null default now()
);

create index if not exists mail_attachments_message_idx
  on public.mail_attachments (message_id);

create table if not exists public.mail_events (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null,
  event_type text not null,
  recipient text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mail_events_provider_idx
  on public.mail_events (provider_message_id, created_at desc);

create table if not exists public.mail_blocklist (
  email text primary key check (email = lower(email)),
  reason text not null check (reason in ('permanent_bounce', 'complaint', 'manual')),
  source_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  blocked_at timestamptz not null default now()
);

alter table public.mail_messages enable row level security;
alter table public.mail_attachments enable row level security;
alter table public.mail_events enable row level security;
alter table public.mail_blocklist enable row level security;

drop policy if exists mail_messages_authenticated_all on public.mail_messages;
create policy mail_messages_authenticated_all
on public.mail_messages
for all
to authenticated
using (true)
with check (true);

drop policy if exists mail_attachments_authenticated_select on public.mail_attachments;
create policy mail_attachments_authenticated_select
on public.mail_attachments
for select
to authenticated
using (true);

drop policy if exists mail_events_authenticated_select on public.mail_events;
create policy mail_events_authenticated_select
on public.mail_events
for select
to authenticated
using (true);

drop policy if exists mail_blocklist_authenticated_select on public.mail_blocklist;
create policy mail_blocklist_authenticated_select
on public.mail_blocklist
for select
to authenticated
using (true);

revoke all on public.mail_messages from anon;
revoke all on public.mail_attachments from anon;
revoke all on public.mail_events from anon;
revoke all on public.mail_blocklist from anon;
