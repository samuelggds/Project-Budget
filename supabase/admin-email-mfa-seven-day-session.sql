-- Execute APOS supabase/admin-email-mfa-migration.sql no Supabase de producao.
-- Somente um OTP correto para o mesmo usuario e session_id concede 7 dias.
-- Grants existentes nao sao prorrogados retroativamente: o novo prazo vale
-- para validacoes realizadas depois da aplicacao desta migration.
-- Sessao Supabase revogada/encerrada continua exigindo login e novo MFA.

begin;

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

  -- Somente o codigo correto e nao expirado libera a MESMA sessao autenticada.
  update public.admin_email_mfa_challenges set consumed_at = now()
  where id = v_challenge.id;

  -- Prazo absoluto: nao e renovado em consultas de status nem em refresh do JWT.
  v_until := now() + interval '7 days';
  insert into public.admin_email_mfa_grants (user_id, session_id, verified_at, expires_at)
  values (p_user_id, p_session_id, now(), v_until)
  on conflict (user_id, session_id)
  do update set verified_at = excluded.verified_at, expires_at = excluded.expires_at;

  return jsonb_build_object('verified', true, 'expiresAt', v_until);
end;
$$;

-- Mantem o RPC restrito ao servidor, como na migration original.
revoke all on function public.admin_email_mfa_verify(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_email_mfa_verify(uuid,uuid,text) to service_role;

comment on function public.admin_email_mfa_verify(uuid,uuid,text) is
  'Valida OTP de email uma unica vez para usuario e sessao autenticada; libera MFA por 7 dias sem renovar em leituras de status.';

commit;
