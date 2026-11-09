# MG Orçamentos

**Aplicação corporativa para gestão de orçamentos e comunicação com clientes** · React · TypeScript · Supabase · AWS · Resend · Tauri

Este repositório contém a aplicação MG Orçamentos associada à MG Refrigerações. O sistema reúne cadastros, emissão de orçamentos e documentos em PDF, além de fluxos de e-mail corporativo. É diferente do projeto experimental de assinaturas do repositório [Projeto-Budget-2](https://github.com/samuelggds/Projeto-Budget-2).

## O problema que a aplicação resolve

O trabalho administrativo exige acompanhar clientes, serviços, documentos e mensagens de orçamento sem espalhar o histórico por várias ferramentas. A aplicação reúne esses fluxos e aplica autenticação e regras de acesso à área administrativa.

| Área | Implementação |
| --- | --- |
| Interface | React, TypeScript e Vite |
| Orçamentos | Cálculos, histórico, status e geração de PDFs |
| Dados e identidade | Supabase Auth, PostgreSQL e políticas RLS |
| Verificação administrativa | MFA por e-mail com validação via API |
| E-mail de entrada | Amazon SES → S3 → SQS → Lambda → Supabase |
| E-mail de saída | Resend e webhook para atualização de eventos |
| Desktop | Estrutura Tauri com atualizações do aplicativo |

## Responsabilidades e decisões técnicas

Projeto independente de Samuel Gomes: implementação de interface e regras de negócio, integração com banco e provedores externos, autenticação e documentação de implantação. Este README não atribui métricas de produtividade, faturamento ou usuários não verificadas.

### Decisões técnicas relevantes

- As chaves privadas de AWS, Resend e Supabase ficam em variáveis exclusivamente de servidor, nunca em `VITE_*`.
- A área administrativa é protegida por sessão Supabase e uma etapa adicional de verificação por e-mail.
- O recebimento e o envio de e-mail usam pipelines diferentes para facilitar operação e tratamento de falhas.
- O fluxo de orçamento admite **Enviado → Em andamento → Aprovado → Pago**; **Recusado** é uma saída alternativa prevista.

## Documentação técnica

- [E-mail corporativo, webhooks e Tauri](docs/email-tauri-production.md)
- [Frontend e módulos](src/modules/)
- [Rotas de API](api/)
- [Testes](tests/)
- [Site institucional da MG Refrigerações](https://mgrefrigeracoes.com.br/) — não é uma demonstração pública do painel administrativo.

## Executar localmente

```bash
npm install
cp .env.example .env
npm run dev
```

Configure no `.env` o endereço e a chave pública do Supabase. Os fluxos que dependem de backend, MFA, SES e Resend exigem também as integrações e variáveis de servidor descritas em [`.env.example`](.env.example) e [documentação de implantação](docs/email-tauri-production.md). Não publique credenciais no repositório.

### Observação sobre o legado de split

**O código desta versão ainda contém `budgetSplit.ts` e referências de interface e banco para um split de 5%.** A presença desses módulos não deve ser confundida com a experiência principal descrita acima. Antes de removê-los, é necessário verificar dependências da interface, das migrations e dos dados; este PR altera **somente a documentação**, sem mudar regras de negócio.

## Mais projetos

- [GastroNexa](https://github.com/samuelggds/Projeto-Restaurants) — SaaS multi-restaurante com Node.js, React e PostgreSQL.
- [SaaS de Orçamentos com Assinaturas](https://github.com/samuelggds/Projeto-Budget-2) — outro projeto, com cobrança Pix recorrente.

[Perfil de Samuel Gomes](https://github.com/samuelggds) · [LinkedIn](https://www.linkedin.com/in/samuel-gomes08/)
