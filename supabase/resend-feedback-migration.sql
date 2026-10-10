-- Migração do feedback de envio do Amazon SES para Resend.
-- Execute uma vez no Supabase antes de habilitar o webhook Resend em produção.

alter table public.mail_events
  add column if not exists provider_event_id text;

drop index if exists public.mail_events_provider_event_recipient_uidx;

create unique index mail_events_provider_event_recipient_uidx
  on public.mail_events (provider_event_id, recipient);

alter table public.mail_blocklist
  drop constraint if exists mail_blocklist_reason_check;

alter table public.mail_blocklist
  add constraint mail_blocklist_reason_check
  check (reason in ('permanent_bounce', 'complaint', 'suppressed', 'manual'));
