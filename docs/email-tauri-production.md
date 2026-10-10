# E-mail corporativo + atualizacoes Tauri

Este documento fecha a configuracao de producao do Budget para:

- receber em `contato@mgrefrigeracoes.com.br` pelo Amazon SES;
- ler e organizar mensagens dentro do Budget;
- responder, encaminhar, salvar rascunhos e baixar anexos;
- enviar orcamentos em PDF pelo Resend;
- tratar delivery, bounce, complaint, suppression e falha;
- bloquear automaticamente destinatarios problematicos;
- avisar o usuario do app Tauri quando existir uma nova versao assinada.

## 1. Banco Supabase

Execute uma vez:

`supabase/mail-migration.sql`

Ao migrar o outbound para Resend, execute tambem:

`supabase/resend-feedback-migration.sql`

Tabelas:

- `mail_messages`
- `mail_attachments`
- `mail_events`
- `mail_blocklist`

O navegador acessa essas tabelas apenas com sessao autenticada.

As Lambdas AWS usam a Secret Key do Supabase armazenada no AWS Secrets Manager.
O webhook Resend usa `SUPABASE_SECRET_KEY` somente na Vercel, server-side, apos validar criptograficamente a assinatura Svix.

Nunca exponha `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` ou credenciais AWS em variaveis `VITE_*`, frontend, repositorio ou logs.

## 2. Recebimento de e-mail continua na AWS

O recebimento permanece:

`Internet -> Amazon SES -> S3 -> SQS -> Lambda inbox -> Supabase -> Budget`

Worker:

`aws/lambda/inbox-worker/index.mjs`

Infra atual:

- bucket S3 de e-mail;
- fila `mgrefrigeracoes-mail-inbox-prod`;
- DLQ `mgrefrigeracoes-mail-dlq-prod`;
- Lambda `mgrefrigeracoes-mail-ingest-prod`;
- segredo `mgrefrigeracoes/budget/supabase` no Secrets Manager.

O worker de entrada continua inalterado e independente do provedor usado para envio.

## 3. Envio de e-mail via Resend

Endpoint:

`api/mail/send.mjs`

O envio continua exigindo:

- sessao Supabase valida;
- usuario igual a `ADMIN_EMAIL`;
- destinatarios validos;
- bloqueio de enderecos existentes em `mail_blocklist`;
- limite de destinatarios e anexos;
- nenhum segredo enviado ao navegador.

Variaveis Vercel:

- `RESEND_API_KEY`
- `MAIL_FROM_EMAIL=contato@mgrefrigeracoes.com.br`
- `MAIL_FROM_NAME=MG Refrigerações`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `ADMIN_EMAIL`

O endpoint chama somente a API HTTPS do Resend e persiste o ID retornado em `provider_message_id`.

## 4. Webhook Resend

Endpoint publico:

`https://mgrefrigeracoes.com.br/api/mail/resend-webhook`

Arquivo:

`api/mail/resend-webhook.mjs`

Variaveis Vercel adicionais:

- `RESEND_WEBHOOK_SECRET`
- `SUPABASE_SECRET_KEY`

Eventos recomendados no Resend:

- `email.delivered`
- `email.bounced`
- `email.complained`
- `email.failed`
- `email.suppressed`

Seguranca do webhook:

- body parser desabilitado;
- assinatura `svix-id`, `svix-timestamp` e `svix-signature` validada sobre o corpo bruto;
- tolerancia maxima de 5 minutos para reduzir replay;
- comparacao de assinatura em tempo constante;
- nenhuma escrita no Supabase ocorre antes da assinatura ser validada;
- eventos sao idempotentes por `provider_event_id + recipient`.

Comportamento:

- `email.delivered` -> `delivered`;
- `email.bounced` -> `bounced`;
- `email.complained` -> `complained`;
- `email.failed` -> `failed`;
- `email.suppressed` -> `bounced`;
- bounce permanente, complaint e suppression entram em `mail_blocklist`.

## 5. Vercel

Variaveis obrigatorias:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `ADMIN_EMAIL`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `MAIL_FROM_EMAIL=contato@mgrefrigeracoes.com.br`
- `MAIL_FROM_NAME=MG Refrigerações`
- `AWS_REGION=sa-east-1`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `MAIL_BUCKET=mgrefrigeracoes-mail-prod-900558045319-sa-east-1-an`

As credenciais AWS na Vercel continuam somente porque o endpoint de anexos recebidos precisa ler objetos no S3.
Depois da migracao do outbound, remova a permissao `ses:SendRawEmail` do usuario IAM da Vercel.

Permissao AWS minima da Vercel apos o cutover:

- S3: `s3:GetObject` apenas em `inbox/attachments/*` do bucket de e-mail.

## 6. DNS do dominio no Resend

Antes de ativar envio real:

1. adicione `mgrefrigeracoes.com.br` no Resend;
2. publique exatamente os registros DNS fornecidos pelo Resend;
3. aguarde o dominio ficar verificado;
4. mantenha os registros existentes do SES que ainda forem necessarios para recebimento;
5. nao substitua o MX de recebimento do dominio principal sem planejar a migracao do inbound.

O remetente esperado permanece:

`MG Refrigerações <contato@mgrefrigeracoes.com.br>`

## 7. Cutover seguro

Ordem recomendada:

1. executar `supabase/resend-feedback-migration.sql`;
2. verificar dominio no Resend;
3. adicionar secrets na Vercel;
4. fazer deploy desta branch;
5. criar o webhook Resend apontando para `/api/mail/resend-webhook`;
6. selecionar os cinco eventos de feedback;
7. testar envio para endereco controlado;
8. confirmar `sent -> delivered` no Supabase;
9. testar bounce com endereco de teste suportado pelo provedor;
10. confirmar blocklist;
11. somente depois remover `ses:SendRawEmail` do IAM da Vercel;
12. manter o SES apenas para inbound.

Nao desative a infraestrutura de feedback SES antes de confirmar o Resend em producao; ela pode ser removida depois do cutover validado.

## 8. Painel de e-mail

O menu **E-mail** continua oferecendo:

- Caixa de entrada
- Enviados
- Rascunhos
- Arquivados
- Lixeira
- busca
- leitura por thread
- responder
- responder a todos
- encaminhar
- anexos
- envio de orcamento em PDF
- status de entrega/falha

A troca de provedor e server-side e nao altera o fluxo da interface.

## 9. Atualizador Tauri

O updater do Tauri exige assinatura criptografica e nao permite desativar essa verificacao.

Secrets de build:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ADMIN_EMAIL`

A chave publica permanece fixa em `MG-Orçamento/src-tauri/tauri.conf.json`.

## 10. Regra de seguranca

Nunca:

- comite Secret Key do Supabase;
- comite `RESEND_API_KEY` ou `RESEND_WEBHOOK_SECRET`;
- coloque segredos em `VITE_*`;
- aceite webhook sem validacao de assinatura;
- desabilite blocklist para forcar envio;
- remova RLS para contornar erro;
- publique artefato Tauri sem assinatura.
