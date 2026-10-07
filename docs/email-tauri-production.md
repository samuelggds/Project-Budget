# E-mail corporativo + atualizações Tauri

Este documento fecha a configuração de produção do Budget para:

- receber em `contato@mgrefrigeracoes.com.br`;
- ler e organizar mensagens dentro do Budget;
- responder, encaminhar, salvar rascunhos e baixar anexos;
- enviar orçamentos em PDF pelo Amazon SES;
- tratar bounce/complaint e bloquear destinatários problemáticos;
- avisar o usuário do app Tauri quando existir uma nova versão assinada.

## 1. Banco Supabase

Execute **uma vez** no SQL Editor:

`supabase/mail-migration.sql`

As tabelas são:

- `mail_messages`
- `mail_attachments`
- `mail_events`
- `mail_blocklist`

O navegador acessa essas tabelas apenas com sessão autenticada. A chave `SUPABASE_SERVICE_ROLE_KEY` é usada somente pelos workers Lambda e nunca deve ser exposta em variáveis `VITE_*`.

## 2. Vercel

Cadastre as variáveis do arquivo `.env.example`.

Obrigatórias para o e-mail:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `ADMIN_EMAIL`
- `AWS_REGION=sa-east-1`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `MAIL_BUCKET=mgrefrigeracoes-mail-prod-900558045319-sa-east-1-an`
- `SES_FROM_EMAIL=contato@mgrefrigeracoes.com.br`
- `SES_FROM_NAME=MG Refrigerações`

Para o atualizador do repositório privado:

- `GITHUB_RELEASES_TOKEN`

Use um token GitHub fine-grained somente leitura, restrito ao repositório `Project-Budget`, com acesso mínimo necessário para ler metadata/conteúdo/releases. O token fica somente na Vercel. Ele nunca é enviado ao app Tauri.

### IAM da Vercel

Crie credenciais IAM específicas para o Budget. Não use usuário root e não reutilize credenciais administrativas.

Permissões mínimas:

- SES: `ses:SendRawEmail` para a identidade verificada de `mgrefrigeracoes.com.br`;
- S3: `s3:GetObject` apenas em `inbox/attachments/*` do bucket de e-mail.

## 3. Worker de entrada

Código:

`aws/lambda/inbox-worker/`

Runtime recomendado: Node.js atual suportado pela AWS Lambda.

Variáveis:

- `AWS_REGION=sa-east-1`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Conecte a Lambda à fila:

`mgrefrigeracoes-mail-inbox-prod`

Configuração recomendada do gatilho:

- batch pequeno;
- partial batch response quando habilitado;
- concorrência suficiente para baixo volume;
- DLQ/redrive já existente na fila.

IAM da Lambda:

- `s3:GetObject` em `inbox/raw/*`;
- `s3:PutObject` em `inbox/attachments/*`;
- logs do CloudWatch.

O worker é idempotente por `message_id` e usa chaves determinísticas para anexos, evitando duplicação em retries.

## 4. Worker de feedback do SES

Código:

`aws/lambda/feedback-worker/index.mjs`

Variáveis:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Conecte à fila:

`mgrefrigeracoes-ses-feedback-queue-prod`

O worker:

- marca mensagens como `bounced`, `complained` ou `delivered`;
- grava eventos em `mail_events`;
- adiciona bounce permanente e complaint à `mail_blocklist`;
- o endpoint de envio recusa destinatários existentes nessa blocklist.

Para registrar **Entregue**, configure no SES a notificação **Delivery** para o mesmo tópico:

`mgrefrigeracoes-ses-feedback-prod`

Bounce e Complaint já usam esse tópico.

## 5. Painel de e-mail

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
- envio de orçamento em PDF
- status de entrega/falha

Mensagens recebidas são exibidas como texto simples no painel. HTML recebido não é injetado no DOM, evitando XSS originado em e-mail.

## 6. Sandbox do SES

Enquanto a conta estiver no sandbox, o painel pode ser implantado normalmente.

O recebimento continua funcionando. O envio real para destinatários não verificados só passa a funcionar após a AWS conceder production access.

Nenhuma alteração de código é necessária quando o SES sair do sandbox.

## 7. Assinatura do atualizador Tauri

O updater do Tauri exige assinatura criptográfica e **não permite desativar essa verificação**.

Gere a chave uma única vez em uma máquina confiável:

PowerShell:

```powershell
npm run tauri signer generate -- -w "$HOME\.tauri\mg-orcamentos.key"
```

Guarde o arquivo privado fora do repositório e faça backup seguro. Perder essa chave impede publicar atualizações para instalações existentes.

No GitHub, configure os secrets:

- `TAURI_SIGNING_PRIVATE_KEY` = conteúdo ou caminho suportado da chave privada no workflow
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ADMIN_EMAIL`

A chave pública já fica fixada em `MG-Orçamento/src-tauri/tauri.conf.json`; ela não é secreta e o app usa esse valor para validar as assinaturas.

## 8. Publicação de uma atualização

Antes de publicar:

1. aumente a versão em:
   - `package.json`
   - `MG-Orçamento/src-tauri/tauri.conf.json`
   - `MG-Orçamento/src-tauri/Cargo.toml`
2. faça o merge somente após CI aprovado;
3. crie/push uma tag com a mesma versão, por exemplo `v1.1.0`.

O workflow `.github/workflows/tauri-release.yml`:

- compila o app Windows/NSIS;
- cria os artefatos do updater;
- assina os artefatos;
- cria a GitHub Release;
- publica `latest.json`.

O app instalado consulta:

`https://mgrefrigeracoes.com.br/api/updates/latest`

A Vercel acessa a release privada usando o token apenas no servidor e entrega o manifesto/instalador ao updater sem expor o token do GitHub.

Ao detectar versão maior, o Budget mostra **Nova versão do MG Orçamentos disponível** com o botão **Atualizar agora**. O app também verifica novamente a cada 30 minutos.

## 9. Regra de segurança para releases

Nunca:

- comite a chave privada do Tauri;
- coloque `AWS_SECRET_ACCESS_KEY`, service role do Supabase ou token GitHub em `VITE_*`;
- publique artefato de atualização sem assinatura;
- desabilite a verificação de assinatura para contornar erro de release.

Se uma release falhar, corrija o pipeline e publique uma versão nova.
