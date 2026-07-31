# MG Orçamentos

Frontend React + TypeScript para clientes, catálogo de serviços, orçamentos e PDFs.

## Executar

```bash
npm install
npm run dev
```

Copie `.env.example` para `.env` e ajuste `VITE_API_URL` quando o backend estiver disponível.

## Login seguro com uma única conta

1. Crie um projeto no Supabase.
2. Em Authentication > Users, crie manualmente o único usuário administrador.
3. Em Authentication > Sign In / Providers, desative **Allow new users to sign up**. Assim, somente contas já existentes poderão entrar.
4. Copie `.env.example` para `.env` e informe:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (a chave pública/publishable, nunca `service_role`)
   - `VITE_ADMIN_EMAIL` com o e-mail exato da conta única
5. Cadastre a URL de produção nas configurações de URL do Supabase antes do deploy.

O aplicativo não possui tela nem função de cadastro. A sessão é conferida com o servidor do Supabase, contas com outro e-mail são desconectadas e o botão de sair encerra somente a sessão do dispositivo atual.

## Banco de dados

Clientes, serviços, orçamentos e itens são lidos e gravados diretamente no Supabase usando a sessão autenticada e as políticas RLS. O backend deve validar o fluxo `Enviado → Em andamento → Aprovado → Pago`. `Recusado` é uma saída separada a partir de `Enviado` ou `Em andamento`. Nunca aceite regressão de status.

Os PDFs continuam guardados no navegador via IndexedDB. Os registros e cálculos ficam sincronizados no Supabase; a sincronização dos próprios arquivos PDF exige configurar um bucket no Supabase Storage em uma etapa separada.

## Split

O frontend calcula 5% sobre orçamentos `Aprovado` ou `Pago`. O status `Pago` do orçamento não quita o split. O pagamento do split é controlado separadamente em `budgets.split_paid_at`: somente o botão manual da aba Splits abate o valor do total pendente. Execute `supabase/split-payment-migration.sql` uma vez no SQL Editor antes de usar essa versão.
