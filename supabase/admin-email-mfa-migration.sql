-- Execute no SQL Editor do Supabase ANTES de publicar a versao com MFA.
-- Protecao por usuario + session_id do JWT: email/password sozinho NAO libera RLS.
-- O envio/validacao dos codigos ocorre apenas nas API Functions da Vercel (service role).

create table if not exists public.admin_email_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index if not exists admin_email_mfa_challenges_user_created_idx
  on public.admin_email_mfa_challenges (user_id, created_at desc);
create index if not exists admin_email_mfa_challenges_session_idx
  on public.admin_email_mfa_challenges (user_id, session_id, created_at desc);

create table if not exists public.admin_email_mfa_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, session_id)
);

alter table public.admin_email_mfa_challenges enable row level security;
alter table public.admin_email_mfa_grants enable row level security;
revoke all on public.admin_email_mfa_challenges from public, anon, authenticated;
revoke all on public.admin_email_mfa_grants from public, anon, authenticated;
-- Nao criar politicas de acesso para anon/authenticated nestas tabelas.
-- A API usa funcoes SECURITY DEFINER com execucao EXCLUSIVA de service_role.

create or replace function public.admin_email_mfa_verified()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.admin_email_mfa_grants grant_row
    where grant_row.user_id = auth.uid()
      and grant_row.session_id::text = (auth.jwt() ->> 'session_id')
      and grant_row.expires_at > now()
  );
$$;

create or replace function public.admin_email_mfa_status(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v_until timestamptz;
begin
  select expires_at into v_until
  from public.admin_email_mfa_grants
  where user_id = p_user_id
    and session_id = p_session_id
    and expires_at > now();
  return jsonb_build_object(
    'verified', v_until is not null,
    'expiresAt', v_until
  );
end;
$$;

create or replace function public.admin_email_mfa_request(
  p_user_id uuid,
  p_session_id uuid,
  p_code_hash text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v_last timestamptz; v_count integer; v_id uuid;
begin
  if p_code_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('allowed', false);
  end if;

  -- Uma transacao por usuario para evitar corrida no limite de reenvios.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select max(created_at) into v_last
  from public.admin_email_mfa_challenges where user_id = p_user_id;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object(
      'allowed', false,
      'retryAfter', greatest(1, ceil(extract(epoch from v_last + interval '60 seconds' - now()))::int)
    );
  end if;

  select count(*) into v_count from public.admin_email_mfa_challenges
    where user_id = p_user_id and created_at > now() - interval '1 hour';
  if v_count >= 6 then
    return jsonb_build_object('allowed', false, 'retryAfter', 3600);
  end if;

  update public.admin_email_mfa_challenges
  set consumed_at = now()
  where user_id = p_user_id and session_id = p_session_id and consumed_at is null;

  insert into public.admin_email_mfa_challenges (
    user_id, session_id, code_hash, expires_at
  ) values (
    p_user_id, p_session_id, p_code_hash, now() + interval '5 minutes'
  ) returning id into v_id;

  return jsonb_build_object('allowed', true, 'challengeId', v_id, 'expiresIn', 300);
end;
$$;

create or replace function public.admin_email_mfa_verify(
  p_user_id uuid,
  p_session_id uuid,
  p_code_hash text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v_challenge public.admin_email_mfa_challenges%rowtype;
        v_until timestamptz;
begin
  select * into v_challenge
  from public.admin_email_mfa_challenges
  where user_id = p_user_id and session_id = p_session_id
  order by created_at desc limit 1 for update;

  if not found or v_challenge.consumed_at is not null then
    return jsonb_build_object('verified', false, 'reason', 'missing');
  end if;
  if v_challenge.expires_at <= now() then
    return jsonb_build_object('verified', false, 'reason', 'expired');
  end if;
  if v_challenge.attempts >= 5 then
    return jsonb_build_object('verified', false, 'reason', 'locked');
  end if;

  update public.admin_email_mfa_challenges
  set attempts = attempts + 1,
      consumed_at = case when attempts + 1 >= 5 then now() else consumed_at end
  where id = v_challenge.id;

  if v_challenge.code_hash <> p_code_hash then
    return jsonb_build_object('verified', false, 'reason', 'invalid');
  end if;

  -- Codigo correto na ultima tentativa tambem pode confirmar uma unica vez.
  update public.admin_email_mfa_challenges set consumed_at = now()
  where id = v_challenge.id;

  v_until := now() + interval '60 minutes';
  insert into public.admin_email_mfa_grants (user_id, session_id, verified_at, expires_at)
  values (p_user_id, p_session_id, now(), v_until)
  on conflict (user_id, session_id)
  do update set verified_at = excluded.verified_at, expires_at = excluded.expires_at;

  return jsonb_build_object('verified', true, 'expiresAt', v_until);
end;
$$;

-- Nao confie na ocultacao do frontend: RLS valida MFA em TODAS as operacoes
-- de dados do painel, inclusive se alguem chamar a API do Supabase diretamente.
do $$
declare tab text;
begin
  foreach tab in array array[
    'clients', 'services', 'budgets', 'budget_items', 'company_settings',
    'mail_messages', 'mail_attachments', 'mail_events', 'mail_blocklist'
  ] loop
    if to_regclass(format('public.%I',tab)) is not null then
      execute format('alter table public.%I enable row level security', tab);
      execute format('drop policy if exists admin_email_mfa_required on public.%I', tab);
      execute format(
        'create policy admin_email_mfa_required on public.%I as restrictive for all to authenticated using ((select public.admin_email_mfa_verified())) with check ((select public.admin_email_mfa_verified()))',
        tab
      );
    end if;
  end loop;
end;
$$;

-- PostgreSQL da EXECUTE para PUBLIC por padrao: revogue explicitamente.
revoke all on function public.admin_email_mfa_verified() from public, anon;
grant execute on function public.admin_email_mfa_verified() to authenticated;
revoke all on function public.admin_email_mfa_status(uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_email_mfa_request(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.admin_email_mfa_verify(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_email_mfa_status(uuid,uuid) to service_role;
grant execute on function public.admin_email_mfa_request(uuid,uuid,text) to service_role;
grant execute on function public.admin_email_mfa_verify(uuid,uuid,text) to service_role;

comment on function public.admin_email_mfa_verified() is
  'Retorna true somente apos OTP enviado por email e validado para a mesma sessao JWT.';
