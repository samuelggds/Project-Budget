# Publicacao MG Refrigerações - landing e MFA por e-mail

## Antes de fazer merge/deploy

1. Execute `supabase/admin-email-mfa-migration.sql` **no SQL Editor de producao**. A migration adiciona politica **restritiva** em `clients`, `services`, `budgets`, `budget_items`, `company_settings` e tabelas de e-mail. Sem ela, a autenticacao por email nao protege as tabelas diretamente.
2. Configure no projeto Vercel `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL`, `RESEND_API_KEY`, `MAIL_FROM_EMAIL` e **`ADMIN_MFA_PEPPER`** (segredo aleatorio >= 32 caracteres, guardado so no servidor). Ajuste `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_ADMIN_EMAIL` no frontend.
3. O e-mail destinatario MFA esta fixado no servidor em `matheuslegend10@hotmail.com`. `ADMIN_EMAIL` identifica a conta que faz login, e **nao** altera o destino do codigo. Confirme que a caixa receptora funciona antes de bloquear acesso.
4. Certifique-se de que o remetente `MAIL_FROM_EMAIL` e dominio estejam verificados no Resend, e que o envio para o Outlook/Hotmail funciona na pratica.
5. Publique as functions em Vercel, rode `npm run build`, teste fluxo de login -> solicitar codigo -> receber -> verificar -> entrar e teste acesso a PostgREST antes/depois de MFA. Teste logout e nova sessao.
6. O app Tauri usa `VITE_API_URL` para acessar `/api/auth/admin-mfa`. Verifique se aponta para o servidor Vercel funcional antes de atualizar o desktop.
7. A verificacao dura 60 minutos **por sessao**, os codigos expiram em 5 minutos, ha 5 tentativas por desafio, intervalo minimo 60 segundos e limite 6 envios/hora por usuario. A migration deve ser aplicada antes do frontend entrar em producao.
8. Confirmar outras tabelas, buckets do Storage e permissoes SQL existentes na instalacao de producao; politicas RLS para as tabelas listadas foram adicionadas de forma condicional. Testar especialmente que arquivos locais/PDFs nao sejam acessiveis por sessao sem MFA.

## Alteracoes visuais

- Header e footer usam `/MG_icon.png`, sem moldura, com proporcao `object-fit: contain` e tamanho consistente.
- Hero referencia imagem ilustrativa brasileira do Wikimedia Commons, carregada remotamente. Verifique disponibilidade e licenca/credito da foto antes de publicar. Preferir foto propria da frota e equipamento quando disponivel.
- Efeitos leves de entrada/reveal, hover e transicoes; respeitam `prefers-reduced-motion`.
- Nenhuma alteracao foi feita nas regras de orcamentos e pagamentos.

**Observacao:** o bloqueio RLS e obrigatorio: esconder so o painel com React nao substitui autorizacao no Supabase. Esta atualizacao deve ser testada com plano de rollback, pois uma migration mal configurada pode bloquear acesso aos dados.
