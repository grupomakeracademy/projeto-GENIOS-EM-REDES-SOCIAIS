# Geração exclusivamente sob demanda — 24/09/2026

## Auditoria e contenção

O servidor Next local foi interrompido antes das mudanças, pois hospedava o consumidor contínuo. Não havia processo externo `scripts/worker.ts` separado. O consumidor interno consultava a fila cinco segundos após cada tick; o script externo também tinha um loop de cinco segundos. O endpoint autenticado `/api/jobs/tick` chamava o mesmo processamento.

O tick anterior acumulava três responsabilidades: publicação agendada, criação de jobs de rotinas e seleção global por `claim_job()`. Assim, ativar o consumidor podia executar um pedido antigo, sem um clique novo. Isso foi observado no job `cdbbd122-0e92-49af-9ed6-3efabf9c6651` no teste anterior.

A auditoria atual encontrou 37 jobs COMPLETED, três FAILED e nenhum PENDING/RUNNING; a única rotina estava desativada. Não havia tabela `cron.job` no Supabase. Não foi comprovado loop infinito de chamadas: os quatro jobs recentes tinham uma tentativa, e os últimos registros anteriores a esta correção eram de 20:39 UTC. O claim anterior já excluía COMPLETED e limitava tentativas a três, mas podia recuperar leases expirados; a ação de retry zerava tentativas. Havia também registros históricos sem job_id de operações de IA fora da geração de conteúdo; eles não comprovam geração autônoma e não foram removidos.

## Implementação

- POST `/api/runs` valida usuário, workspace, agente, payload e cota. `enqueue_manual_generation` cria o job de forma transacional, com chave de idempotência. Rascunhos são bloqueados durante o enqueue e não podem reinicializar um job concluído.
- A solicitação registra `after()` do Next, que chama `processRequestedJob` para o ID retornado. Não há busca por outro job, timer de geração ou acionamento pelo navegador para consumir a fila.
- `claim_requested_job` faz UPDATE atômico de PENDING para RUNNING, exige autorização, workspace, marca `dispatch_mode=user_request`, orçamento de tentativas e origem não rotineira. Chamadas concorrentes obtêm no máximo um claim.
- RUNNING é o nome já utilizado pelo banco para a etapa PROCESSING. Foi mantido para compatibilidade com leases, persistência e frontend. O fluxo é PENDING → RUNNING → COMPLETED/FAILED.
- O pipeline existente gera e salva o conteúdo. A função retorna ao concluir ou falhar e a tarefa termina. O frontend continua consultando apenas o estado; essa consulta não gera conteúdo.
- Falhas não voltam automaticamente para PENDING. Uma repetição exige ação explícita; o contador não é zerado e respeita `max_attempts` (três por padrão). Os checkpoints existentes são preservados.
- Leases abandonados e pedidos sem início após 15 minutos tornam-se FAILED pela manutenção ou na leitura de status/inicialização. Não são reprocessados automaticamente. O histórico permanece armazenado.
- `claim_job()` legado retorna vazio; `/api/jobs/tick` retorna 410 após autenticação; `pnpm worker` apenas informa que o processamento é sob demanda e encerra.
- A manutenção existente de publicações agendadas continua ativa e não cria nem captura jobs de IA. Geração por rotinas não é mais disparada automaticamente, conforme a nova regra.
- `AI_CALL` e `AI_CALL_RESULT` registram callId, horário, jobId, runId, tentativa, origem, operação, modelo, resultado e tokens disponíveis. `usage_events` continua guardando o consumo. Validação de provedor da geração ocorre dentro do job, para preservar a associação. Prompts, modelos e chaves não foram modificados.

## Validação

- 33 testes automatizados passaram: claim/idempotência, proteção de rascunhos, limite de retries, autorização, expiração, ciclo da tarefa, worker, elegibilidade e adapters de IA. TypeScript e lint dos arquivos de execução passaram.
- O lint do modal mantém um erro preexistente `react-hooks/set-state-in-effect`, confirmado também no arquivo de HEAD. O preenchimento do formulário não foi refatorado fora do escopo.
- Concorrência real no PostgreSQL, com duas conexões: retornos `[1, 0]`; após COMPLETED, novo claim retornou zero. Usado somente um registro sintético, removido ao final; nenhum job histórico foi excluído.
- Ociosidade inicial: 23:25:45–23:27:14 UTC, 89 segundos, zero AI_CALL; `usage_events` permaneceu com 272 registros.
- Gerar agora: `c9f059c9-0a2e-4273-9101-46c95ad0d492`, início 23:27:27, conclusão 23:28:18 UTC; uma tentativa, uma variante, uma imagem e legenda de 315 caracteres, AWAITING_REVIEW confirmado na interface.
- Pós-geração: até 23:29:22 UTC, 64 segundos após concluir, nenhuma chamada adicional; sete chamadas totais da execução e 278 registros de consumo estáveis. As chamadas correspondem às etapas do pipeline existente, incluindo pesquisa; não representam jobs duplicados.
- Nova geração pela ação existente “Novo conteúdo” (equivalente a “Gerar mais conteúdo”): `7b8bb24e-1e32-424f-8b9b-cbfb00416f56`, início 23:29:50, conclusão 23:30:42 UTC. Clique duplo produziu somente um job, uma tentativa, uma variante, uma imagem e legenda de 257 caracteres. AWAITING_REVIEW confirmado na interface.
- Endpoint legado testado: HTTP 410. Logs locais da execução: `.local-logs/demand-generation.log`.
- Ociosidade após a segunda geração: até 23:32:36 UTC, 114 segundos após concluir, nenhum AI_CALL adicional. O total permaneceu em 14 chamadas das duas execuções e 284 registros de consumo; última chamada registrada às 23:30:39 UTC.

## Arquivos desta alteração

- `src/instrumentation.ts`
- `src/lib/jobs/lifecycle.ts`
- `src/lib/jobs/worker.ts`
- `src/lib/jobs/eligibility.ts`
- `src/app/api/runs/route.ts`
- `src/app/api/content/[id]/route.ts`
- `src/app/api/jobs/tick/route.ts`
- `src/features/content/modal.tsx`
- `src/lib/ai/audit.ts`
- `src/lib/ai/providers.ts`
- `src/lib/ai/validate-model.ts`
- `scripts/worker.ts`
- `supabase/migrations/202609250001_demand_generation.sql` — aplicada ao Supabase após dry run com rollback.
- `tests/job-lifecycle.test.ts`
- `tests/worker-recovery.test.ts`
- `tests/ai-background-eligibility.test.ts`
- `tests/demand-jobs.test.ts`
- Este relatório.

Validação real feita no servidor Node local em `http://127.0.0.1:3001`. O servidor precisa estar disponível para receber solicitações. Interrupções de processo não retomam chamadas de IA silenciosamente: resultam em expiração terminal e exigem uma nova ação explícita para repetir.
