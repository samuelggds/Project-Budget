-- Correção para ambientes que executaram a primeira versão da migração do Resend.
-- O índice parcial anterior não pode ser inferido pelo ON CONFLICT usado via PostgREST.

drop index if exists public.mail_events_provider_event_recipient_uidx;

create unique index mail_events_provider_event_recipient_uidx
  on public.mail_events (provider_event_id, recipient);
