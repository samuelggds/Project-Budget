-- Execute uma vez no Supabase: SQL Editor > New query > Run.
alter table public.budgets
  add column if not exists split_paid_at timestamptz;

-- O status PAGO do orçamento é independente do pagamento do split.
create or replace function public.validate_budget_status()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then return new; end if;
  if old.status = 'ENVIADO' and new.status in ('EM_ANDAMENTO', 'RECUSADO') then return new; end if;
  if old.status = 'EM_ANDAMENTO' and new.status in ('APROVADO', 'RECUSADO') then return new; end if;
  if old.status = 'APROVADO' and new.status = 'PAGO' then return new; end if;
  raise exception 'Mudança de status não permitida: % para %', old.status, new.status;
end;
$$;
