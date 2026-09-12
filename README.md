# Gênios para Redes Sociais

Plataforma SaaS multiempresa para planejar, gerar, revisar, agendar e acompanhar conteúdo de redes sociais com IA. A interface segue as referências fornecidas para dashboard, conteúdos, calendário e configurações, com estados vazios reais e sem dados simulados em produção.

## O que está implementado

- Autenticação por e-mail e senha com Supabase Auth, recuperação de senha e sessão SSR.
- Onboarding persistente com empresa, agente, público, posicionamento, objetivos, tom, identidade visual, canais e fuso horário.
- Isolamento multi-tenant por `workspace_id`, papéis `ADMIN`, `EDITOR` e `VIEWER`, RLS e trilha de auditoria.
- Agentes de marca configuráveis e execução de geração em segundo plano.
- Pipeline real de pesquisa, texto, imagem e embeddings com adaptadores OpenAI, Anthropic, Google e Tavily.
- Registro explícito de modelos: um administrador informa o ID oficial e o servidor confirma sua existência no provedor antes de disponibilizá-lo.
- Conteúdos com variações por canal, edição, aprovação, regeneração, versionamento otimista, agendamento e exportação.
- Calendário mensal, biblioteca privada de referências, notificações e busca.
- Credenciais de IA exclusivamente no ambiente do servidor, com status somente leitura e validação no provedor ao cadastrar modelos.
- Worker com fila PostgreSQL, leases, tentativas, idempotência e checkpoints.
- Internacionalização em português do Brasil, inglês e espanhol.
- Layout responsivo e acessível, inspirado nas quatro referências visuais do projeto.

## Arquitetura

O frontend e as APIs usam Next.js App Router. O Supabase fornece PostgreSQL, Auth e Storage. As rotas privadas usam o cliente autenticado do usuário para que a autorização seja aplicada pelo banco; o cliente administrativo aparece apenas em operações de servidor que precisam acessar credenciais criptografadas ou administrar recursos. A função `guard` centraliza autenticação, workspace ativo, papel e verificação de origem.

Uma solicitação de geração cria um `run` e um `background_job` na mesma transação. O worker reivindica um job com `FOR UPDATE SKIP LOCKED`, renova o lease, grava checkpoints e executa somente integrações configuradas. Falta de credencial ou capacidade retorna erro explícito; a aplicação não substitui o resultado por conteúdo fictício.

As publicações sociais estão expostas como conectores de exportação manual. Aprovar um conteúdo muda seu estado para `APPROVED`; isso não o publica. Integrações oficiais podem ser adicionadas ao contrato em `src/lib/social/connectors.ts` quando credenciais e permissões das plataformas estiverem disponíveis.

## Configuração local

Requisitos: Node.js 20 ou superior e um projeto Supabase.

1. Copie `.env.example` para `.env.local`.
2. Defina a URL e a chave publicável do Supabase.
3. Defina a `SUPABASE_SERVICE_ROLE_KEY` apenas no ambiente de servidor.
4. Gere `CREDENTIAL_MASTER_KEY` com 32 bytes aleatórios em Base64 e um `WORKER_SECRET` longo e aleatório.
5. Aplique, em ordem, os arquivos de `supabase/migrations` no banco.
6. Instale as dependências e inicie a aplicação:

```bash
npm ci
npm run dev
```

Abra `http://127.0.0.1:3001`. Após o cadastro, conclua o onboarding e configure ao menos uma credencial de IA em **Configurações**.

## Variáveis de ambiente

| Variável                                  | Escopo             | Uso                                             |
| ----------------------------------------- | ------------------ | ----------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                | Público            | URL do projeto Supabase                         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`    | Público            | Chave anon/publishable protegida por RLS        |
| `SUPABASE_SERVICE_ROLE_KEY`               | Servidor           | Operações administrativas controladas           |
| `APP_ORIGIN`                              | Servidor           | Origem aceita nas mutações e callbacks          |
| `LOCAL_SIGNUP_WITHOUT_EMAIL_CONFIRMATION` | Desenvolvimento    | Contorna o limite de e-mail apenas em localhost |
| `CREDENTIAL_MASTER_KEY`                   | Servidor           | Chave Base64 de 32 bytes para criptografia      |
| `WORKER_SECRET`                           | Servidor           | Autorização do endpoint interno de jobs         |
| `OPENAI_API_KEY`                          | Servidor, opcional | Credencial global OpenAI                        |
| `ANTHROPIC_API_KEY`                       | Servidor, opcional | Credencial global Anthropic                     |
| `GOOGLE_API_KEY`                          | Servidor, opcional | Credencial global Google AI                     |
| `TAVILY_API_KEY`                          | Servidor, opcional | Pesquisa externa com citações                   |

As chaves de IA são lidas exclusivamente do ambiente do servidor. Não são recebidas pelo frontend nem recuperadas da tabela legada de credenciais. O resolver aceita OPENAI_API_KEY / OPENAI_KEY, GOOGLE_API_KEY / GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY e ANTHROPIC_API_KEY / CLAUDE_API_KEY, nessa ordem. Valores vazios são ignorados. GET /api/ai/credentials/status exige ADMIN autenticado e retorna somente booleans, sem cache. Verde indica presença, não validade ou saldo.

O bypass local de confirmação só é aceito fora de produção e quando a requisição parte de `localhost` ou `127.0.0.1`. Mantenha essa opção desativada nos ambientes publicados e configure SMTP próprio no Supabase antes do lançamento.

## Banco e armazenamento

As migrations criam o domínio multiempresa, políticas RLS, perfis vinculados ao Supabase Auth, conteúdo, fila, vetores, transações de onboarding e geração, bloqueio durante regeneração e o registro de modelos. O bucket privado `brand-assets` aceita referências da marca; metadados e objetos são isolados pelo workspace.

Para um ambiente novo, aplique todas as migrations com a CLI do Supabase ou pelo SQL Editor. O script abaixo confirma o acesso administrativo às tabelas essenciais:

```bash
npx tsx --env-file=.env.local scripts/check-connection.ts
```

## Modelos e provedores

Preencha OPENAI_API_KEY no .env.local do servidor e reinicie a aplicação e o worker. Consulte o status em **Configurações → Credenciais de IA**. Em seguida, escolha a função, o provedor e use **Cadastrar modelo**. O servidor consulta a API oficial do provedor e salva o modelo somente se o ID existir. As funções suportadas são:

- `orchestrator`: planejamento e decisões estruturadas;
- `text`: legendas e roteiros;
- `image`: criação visual;
- `embedding`: embeddings OpenAI.

Para adicionar um provedor, implemente autenticação e os métodos em `src/lib/ai/providers.ts`, amplie os schemas em `src/lib/domain.ts`, adicione a credencial em `src/lib/ai/service.ts` e cubra o mapeamento de erros e capacidades com testes.

## Novos conectores sociais

O contrato em `src/lib/social/connectors.ts` separa geração, publicação e analytics. Para integrar uma nova rede, adicione seu identificador e perfil visual em `src/lib/domain.ts`, implemente um adapter que declare capacidades reais, trate OAuth e tokens somente no servidor e registre publicações com chave de idempotência. Só marque `canPublish` ou `canReadAnalytics` como verdadeiro depois que as operações oficiais estiverem implementadas e testadas. Atualize também o seletor de canais, o preview e as policies que validam o novo identificador.

## Novo idioma

Adicione o locale aos schemas de perfil e agente em `src/lib/domain.ts`, inclua uma tradução para cada chave em `src/lib/i18n.ts` e atualize os seletores de idioma. O idioma da interface fica no perfil; o idioma do conteúdo fica no agente, portanto os dois devem continuar independentes. Rode o typecheck para identificar chaves ou locales não cobertos.

## Worker e agendamento

Em desenvolvimento, rode o worker continuamente em outro terminal:

```bash
npm run worker
```

Em produção, execute `POST /api/jobs/tick` em um job agendado, enviando `Authorization: Bearer <WORKER_SECRET>`. Uma chamada processa um job elegível. Instâncias concorrentes são seguras porque o banco entrega cada job a apenas um worker durante o lease.

Datas são armazenadas em UTC e exibidas no fuso do workspace. Horários inexistentes ou ambíguos durante mudanças de horário de verão são rejeitados pelo domínio.

## Qualidade

A Central de Suporte persiste chamados, mensagens, anexos privados e eventos no Supabase. As migrations `202609110009_support.sql` e `202609110010_support_storage.sql` incluem RLS, notificações privadas e estado de leitura. ADMIN atende os workspaces em que possui esse papel; EDITOR e VIEWER acessam seus chamados e comunicados autorizados. Não há administrador global implícito.

`scripts/support-smoke.ts` testa as rotas reais em contas e workspaces temporários e remove suas fixtures. A interface possui busca por mensagem/assunto/ID/autor, filtros, paginação, comunicados e histórico. Arquivos são validados por extensão, MIME, assinatura e tamanho (50 MB); os downloads usam links assinados de 60 segundos.

Quando `OPENAI_API_KEY` está presente, os padrões são `gpt-4.1` (orquestrador), `gpt-4.1-mini` (texto), `gpt-image-2.5-flare` (imagem) e `text-embedding-3-small` (memória, 1536 dimensões). Configurações salvas têm precedência. Os padrões podem ser definidos por `OPENAI_ORCHESTRATOR_MODEL`, `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL` e `OPENAI_EMBEDDING_MODEL`. O status verde informa presença da chave; não representa saldo ou garantia de acesso à geração.

`node --conditions=react-server --env-file=.env.local --import tsx scripts/verify-ai.ts` verifica os modelos sem gerar conteúdo. A opção `--generate` realiza quatro chamadas cobradas de teste, sem modificar workspaces.

No Windows, execute `Iniciar-Genios.ps1` para iniciar o servidor local e o worker em segundo plano. Logs ficam em `.local-logs`, ignorados pelo Git. O endereço local é `http://127.0.0.1:3001/login`; os processos precisam permanecer em execução no computador.

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Os testes unitários cobrem regras de domínio, provedores, segurança e horário de verão. A suíte de banco usa PGlite para validar migrations e RLS. `scripts/integration-smoke.ts` executa um fluxo real contra o projeto Supabase configurado, cria fixtures temporárias e as remove ao terminar.

## Implantação

Implante o Next.js em um runtime Node.js compatível com Next 16 e `sharp`, mantendo todas as variáveis de servidor fora do bundle público. Defina `APP_ORIGIN` para a URL HTTPS final, habilite confirmação de e-mail conforme a política do produto, configure o callback do Supabase e mantenha o worker em um processo ou agendamento separado.

Antes de liberar o ambiente, revise a validade das chaves administrativas, ative observabilidade para jobs e erros de provedor e execute o smoke test em um projeto de homologação.
