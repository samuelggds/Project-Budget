# E-mail corporativo + atualizacoes Tauri

Este documento fecha a configuracao de producao do Budget para:

- receber em `contato@mgrefrigeracoes.com.br`;
- ler e organizar mensagens dentro do Budget;
- responder, encaminhar, salvar rascunhos e baixar anexos;
- enviar orcamentos em PDF pelo Amazon SES;
- tratar delivery, bounce e complaint e bloquear destinatarios problematicos;
- avisar o usuario do app Tauri quando existir uma nova versao assinada.

## 1. Banco Supabase

Execute **uma vez** no SQL Editor:

`supabase/mail-migration.sql`

As tabelas sao:

- `mail_messages`
- `mail_attachments`
- `mail_events`
- `mail_blocklist`

O navegador acessa essas tabelas apenas com sessao autenticada. As Lambdas usam uma Secret Key server-side do Supabase armazenada somente no AWS Secrets Manager.

Nunca exponha a Secret Key em variaveis `VITE_*`, no frontend, no repositorio ou em logs.

## 2. Segredo server-side do Supabase

Segredo no AWS Secrets Manager:

`mgrefrigeracoes/budget/supabase`

Formato:

```json
{
  "SUPABASE_URL": "https://SEU-PROJETO.supabase.co",
  "SUPABASE_SECRET_KEY": "sb_secret_..."
}
```

As Lambdas recebem somente:

```text
SUPABASE_SECRET_ID=mgrefrigeracoes/budget/supabase
```

IAM minimo das Lambdas:

- `secretsmanager:GetSecretValue` somente nesse segredo.

As chaves modernas `sb_secret_...` sao enviadas ao Data API pelo header `apikey`. Elas nao sao JWT e nao devem ser enviadas como `Authorization: Bearer`.

## 3. Vercel

Cadastre as variaveis do arquivo `.env.example`.

Obrigatorias para o e-mail:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `ADMIN_EMAIL`
- `AWS_REGION=sa-east-1`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `MAIL_BUCKET=mgrefrigeracoes-mail-prod-900558045319-sa-east-1-an`
- `SES_FROM_EMAIL=contato@mgrefrigeracoes.com.br`
- `SES_FROM_NAME=MG Refrigerações`

Para o atualizador do repositorio privado:

- `GITHUB_RELEASES_TOKEN`

Use um token GitHub fine-grained somente leitura, restrito ao repositorio `Project-Budget`, com acesso minimo necessario para ler metadata/conteudo/releases. O token fica somente na Vercel.

### IAM da Vercel

Crie credenciais IAM especificas para o Budget. Nao use usuario root e nao reutilize credenciais administrativas.

Permissoes minimas:

- SES: `ses:SendRawEmail` para a identidade verificada de `mgrefrigeracoes.com.br`;
- S3: `s3:GetObject` apenas em `inbox/attachments/*` do bucket de e-mail.

## 4. Worker de entrada

Codigo:

`aws/lambda/inbox-worker/index.mjs`

Runtime: Node.js atual suportado pela AWS Lambda.

Variaveis:

- `AWS_REGION=sa-east-1`
- `SUPABASE_SECRET_ID=mgrefrigeracoes/budget/supabase`

Conecte a Lambda a fila:

`mgrefrigeracoes-mail-inbox-prod`

Configuracao atual recomendada:

- batch size: `1`;
- batching window: `0`;
- partial batch response habilitado;
- timeout da Lambda: `30 segundos`;
- visibility timeout da fila: `3 minutos`;
- DLQ: `mgrefrigeracoes-mail-dlq-prod`;
- maxReceiveCount: `5`.

IAM da Lambda:

- `s3:GetObject` em `inbox/raw/*`;
- `s3:PutObject` em `inbox/attachments/*`;
- `sqs:ReceiveMessage`, `sqs:DeleteMessage` e `sqs:GetQueueAttributes` na fila de entrada;
- `secretsmanager:GetSecretValue` somente no segredo do Supabase;
- logs do CloudWatch.

O worker:

- e idempotente por `message_id`;
- usa chaves deterministicas para anexos;
- processa eventos SQS individualmente;
- retorna `batchItemFailures` para retries seguros;
- nao registra corpo, remetente ou anexos no CloudWatch.

## 5. Worker de feedback do SES

Codigo:

`aws/lambda/feedback-worker/index.mjs`

Variaveis:

- `AWS_REGION=sa-east-1`
- `SUPABASE_SECRET_ID=mgrefrigeracoes/budget/supabase`

Conecte a Lambda a fila:

`mgrefrigeracoes-ses-feedback-queue-prod`

DLQ:

`mgrefrigeracoes-ses-feedback-dlq-prod`

O worker:

- marca mensagens como `delivered`, `bounced` ou `complained`;
- grava eventos em `mail_events`;
- adiciona bounce permanente e complaint a `mail_blocklist`;
- retorna `batchItemFailures` para que somente itens com erro sejam tentados novamente;
- nao registra payload completo ou dados sensiveis no CloudWatch.

O endpoint de envio recusa destinatarios existentes na blocklist.

Configure no SES o mesmo topico SNS para:

- Delivery;
- Bounce;
- Complaint.

Topico:

`mgrefrigeracoes-ses-feedback-prod`

Fila:

`mgrefrigeracoes-ses-feedback-queue-prod`

## 6. Painel de e-mail

O menu **E-mail** do Budget oferece:

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

Mensagens recebidas sao exibidas como texto simples no painel. HTML recebido nao e injetado no DOM, evitando XSS originado em e-mail.

O envio exige sessao autenticada e validacao server-side do administrador.

## 7. Sandbox do SES

Enquanto a conta estiver no sandbox:

- recebimento funciona normalmente;
- o painel pode ser implantado;
- envio so funciona para destinatarios permitidos pelas regras do sandbox.

Quando a AWS conceder production access na regiao `sa-east-1`, nenhuma mudanca de codigo sera necessaria para enviar a destinatarios comuns.

## 8. Checklist antes de solicitar nova revisao da AWS

Antes de reabrir o caso de Production Access, validar:

1. dominio `mgrefrigeracoes.com.br` verificado;
2. DKIM bem-sucedido;
3. entrada real funcionando SES -> S3 -> SQS -> Lambda -> Supabase;
4. worker de feedback implantado e ligado a fila de feedback;
5. Delivery, Bounce e Complaint publicados no SNS;
6. bounce permanente e complaint inseridos na `mail_blocklist`;
7. envio recusando destinatarios da blocklist;
8. volume inicial informado como baixo e transacional;
9. nenhum uso de listas compradas, scraping ou marketing nao solicitado.

## 9. Assinatura do atualizador Tauri

O updater do Tauri exige assinatura criptografica e **nao permite desativar essa verificacao**.

Gere a chave uma unica vez em uma maquina confiavel:

PowerShell:

```powershell
npm run tauri signer generate -- -w "$HOME\.tauri\mg-orcamentos.key"
```

Guarde o arquivo privado fora do repositorio e faca backup seguro.

No GitHub, configure os secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ADMIN_EMAIL`

A chave publica fica fixada em `MG-Orçamento/src-tauri/tauri.conf.json` e e usada pelo app para validar as assinaturas.

## 10. Publicacao de uma atualizacao

Antes de publicar:

1. aumente a versao em:
   - `package.json`
   - `MG-Orçamento/src-tauri/tauri.conf.json`
   - `MG-Orçamento/src-tauri/Cargo.toml`
2. faca o merge somente apos CI aprovado;
3. crie/push uma tag com a mesma versao, por exemplo `v1.1.0`.

O workflow `.github/workflows/tauri-release.yml`:

- compila o app Windows/NSIS;
- cria os artefatos do updater;
- assina os artefatos;
- cria a GitHub Release;
- publica `latest.json`.

O app instalado consulta:

`https://mgrefrigeracoes.com.br/api/updates/latest`

## 11. Regra de seguranca

Nunca:

- comite Secret Key do Supabase;
- coloque `AWS_SECRET_ACCESS_KEY`, Secret Key do Supabase ou token GitHub em `VITE_*`;
- publique artefato de atualizacao sem assinatura;
- desabilite a verificacao de assinatura para contornar erro de release.

Se uma release falhar, corrija o pipeline e publique uma versao nova.
