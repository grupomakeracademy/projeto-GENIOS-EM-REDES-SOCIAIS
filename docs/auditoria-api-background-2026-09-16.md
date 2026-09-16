# Auditoria de consumo de IA — 16/09/2026

## Conclusão e limite da evidência

Foram corrigidas duas falhas verificáveis: polling de regeneração que executava a fila e falta de revalidação de jobs/rotinas imediatamente antes de chamadas externas. Também foi fechada a ausência de escopo de workspace na ação de reprocessar referência da Biblioteca.

Não é possível atribuir todo o aumento de cobrança relatado a essas falhas com os registros históricos existentes. A classificação `manual` no banco demonstra a origem registrada pelo sistema, não prova a presença de uma pessoa naquele instante. Os horários e contadores do job podem ser sobrescritos por uma tentativa manual posterior.

No intervalo de 15/09/2026, 04:00–11:00, America/Sao_Paulo, foram encontrados quatro usage_events:

- Job `11bcabc2-2bc1-4eb1-aab3-1968c037ce88`, origem `manual`.
- Primeiro: `2026-09-15T07:09:39.610Z` (04:09:39 local).
- Último: `2026-09-15T07:10:17.317Z` (04:10:17 local).
- OpenAI: duas chamadas de orquestração `gpt-4.1`, uma embedding `text-embedding-3-small`, uma texto `gpt-4.1-mini`.
- O mesmo job foi retomado e concluído às 11:20 locais. Seu estado atual registra uma tentativa, mas isso não reconstrói tentativas anteriores cujo contador foi reiniciado.

Não foi encontrada uma sequência contínua de chamadas entre 04h e 11h. Os logs antigos não cobriam todos os pedidos: pesquisa, interpretação de referências e falhas anteriores à gravação em usage_events tinham lacunas. É necessário cruzar a data, projeto/chave e detalhamento do provedor para reconciliar a cobrança integralmente. A auditoria não consultou APIs de faturamento nem executou geração real.

## Mapeamento

| Caminho | Disparo legítimo | Provedor/endpoint | Frequência |
|---|---|---|---|
| `src/lib/jobs/pipeline.ts` → `AIService.text` | Novo Conteúdo, execução manual, rotina válida, regeneração de texto legada | OpenAI chat/completions; Anthropic messages; Google generateContent | Por etapa sem checkpoint; modelos configurados por finalidade/agente |
| `AIService.vector` | Verificação de novidade de conteúdo em geração | OpenAI embeddings | Por proposta de estratégia, até as 3–5 propostas produzidas |
| `AIService.image` | Geração/regeneração solicitada | OpenAI images/generations ou images/edits; Google generateContent | Por canal/slide; mídia já persistida é reutilizada na geração normal |
| `src/lib/research/provider.ts` | Pesquisa habilitada dentro de geração legítima | OpenAI responses + web_search; alternativamente Tavily search | Etapa sem checkpoint de fontes |
| `src/features/captions/service.ts` | Prompt Mágico ou Storytelling | Serviço de texto configurado | Uma solicitação por operação idempotente |
| `src/app/api/ai/magic-prompt/route.ts:POST` | Melhorar pauta/CTA por ação explícita | Serviço de texto configurado | Por ação |
| `src/lib/ai/asset-knowledge.ts:processAssetKnowledge` | Reprocessar referência via PATCH de Biblioteca | OpenAI chat/completions; gpt-4o ou OPENAI_VISION_MODEL para imagem, gpt-4o-mini para documento | Por reprocessamento explícito; exact_asset/protected_identity não usam IA |
| `src/lib/ai/validate-model.ts`, `api/models:POST`, validação de credencial | Configurar/validar modelo, resolver override antes de operação | GET models nos provedores | Consulta de metadados; não gera conteúdo |

Downloads de imagem retornada pelo provedor são transferência do resultado, não nova geração. Importar apenas armazena imagens; suas ações de legenda usam o serviço de texto acima. Publicação/agendamento reutilizam o fluxo existente e não acionam geração de IA por leitura.

## Background, polling e banco

- `src/instrumentation.ts` inicia o consumidor Node; `runner.ts` consulta a cada 5 segundos após o término do tick. Falhas de consulta usam espera de até 30 segundos. Consultar fila vazia não chama IA.
- `scripts/worker.ts` é o consumidor externo opcional que chama o endpoint autenticado. Na inspeção de processos havia apenas o servidor Next e seu processo filho deste projeto; não havia worker externo separado ativo.
- Rotina existente: agente `c6578b5d-af0d-45bb-b17b-92976ff7d8ee`, agendamento `20ebde28-cc19-4f84-a3c2-0c8d6c772e10`, 08:00, terça/quarta, America/Sao_Paulo. Tanto agente quanto rotina estavam desativados. Nenhuma configuração foi alterada.
- Zero jobs PENDING/RUNNING no banco consultado; não havia jobs para cancelar ou excluir.
- `claim_job` usa lock com SKIP LOCKED, token e lease de 15 minutos. A chave de idempotência da rotina é agente + ocorrência. Limite existente de três tentativas, backoff de 30/60 segundos antes do esgotamento; não foi encontrado retry infinito de provider.
- `/api/runs:GET`, consultas de conteúdos, saldo (30s), credenciais (30s), notificações/suporte, agentes/modelos e histórico de importações fazem consultas de estado. Efeitos de montagem revisados não chamam geração.
- Exceção corrigida: a espera de regeneração em `detail.tsx` enviava POST `/api/jobs/tick` a cada 2 segundos, até 35 iterações. Isso podia processar qualquer job elegível, além de expor uma referência a segredo público de worker. Agora a espera somente consulta conteúdo; execução pertence ao servidor.
- Triggers encontrados validam transições, vínculos, ativos e registram eventos. Não foram encontradas funções públicas com http_post/net.http/cron.schedule; `cron.job` não apresentou agendamentos. Isso descreve o banco inspecionado, não automações externas de outras contas.

## Correções

1. Removido POST de execução da fila do polling de regeneração, incluindo NEXT_PUBLIC_WORKER_SECRET nesse caminho.
2. Jobs de rotina passam a carregar ID do agendamento, ocorrência e configuração de horário/dias/fuso. Validação exige rotina habilitada, agente ativo e ocorrência compatível que já chegou ao horário. Jobs legados de rotina sem essa identificação são recusados; não havia nenhum pendente na implantação.
3. `assertJobEligible` valida vínculo do agente, lease/token/status, cancelamento, arquivo importado, conteúdo arquivado/inexistente e rotina atual. Executa antes do pipeline e novamente no ponto de saída para o provedor. Criação manual continua permitida com a rotina desativada.
4. `job_not_eligible` é erro definitivo, sem retry automático. Limite e checkpoints existentes foram preservados.
5. Reprocessar referência exige que o asset pertença ao workspace autenticado antes de poder chamar IA.
6. `AI_CALL` registra a tentativa antes do fetch, incluindo pedidos que depois falham. AsyncLocalStorage mantém atribuição isolada por execução. Campos: timestamp, provider, model, type, endpoint sem query, source, reason, trigger, jobId, runId, contentId, agentId. IDs não aplicáveis são null. Categorias: user_action, scheduled_routine, retry, system_internal, unknown. Chamadas diretas de scripts fora dos entrypoints instrumentados aparecem como unknown e devem ser investigadas; não há fallback que as rotule artificialmente como ação do usuário.

Uma requisição que já foi enviada antes do cancelamento não pode ser desfeita por essa checagem; a proteção impede a próxima requisição. Não foi alterada a frequência da fila como solução de custo.

## Evidências de validação

84 testes passaram em 10 arquivos: worker-recovery, ai-background-eligibility, agent-ai-resolution, routine-content-quota, captions, providers, regenerate-image, protected-identities-and-exact-assets, database e job-runner. Após ajuste adicional de validação de lease, os 16 testes dos dois arquivos afetados foram repetidos e passaram. Foi adicionado mais um teste de encerramento definitivo de job inelegível, e os sete testes de worker-recovery passaram: total de 85 casos distintos validados. TypeScript passou. Lint dos caminhos revisados não apresentou erros.

- Inatividade simulada: 5.040 ticks de fila vazia, equivalentes a sete horas em intervalos de cinco segundos; zero chamadas ao pipeline/regeneração, zero inserções de jobs.
- Elegibilidade: rotina válida e geração manual aceitas; rotina desativada/alterada, dia/horário incorreto, ausência de agente, conteúdo arquivado/importado, job excluído e lease revogado rejeitados antes de fetch.
- Atribuição: chamada autorizada com fetch mockado registrada uma vez; chave e prompt ausentes dos logs.
- Fluxos existentes: testes de legendas, cotas, adapters de geração, regeneração, agendamento/transações e composição de assets continuaram passando. Não houve publicação externa nem geração paga para validar visualmente provedores.

Observação real com aplicação autenticada aberta e consumidor automático iniciado:

```json
{"phase":"start","timestamp":"2026-09-16T14:34:41.582Z","usage":217,"pending":0,"activeSchedules":0}
{"phase":"end","timestamp":"2026-09-16T14:36:42.468Z","durationSeconds":121,"usage":217,"pending":0,"activeSchedules":0,"usageDelta":0,"providerAttempts":0,"runnerStarted":true,"runnerErrors":false}
```

O período real de observação foi de dois minutos, não sete horas. A simulação longa é complementar. Nenhuma API paga de IA foi utilizada nesta auditoria.

## Arquivos

Alterados: `src/features/content/detail.tsx`, `src/lib/jobs/worker.ts`, `src/lib/ai/service.ts`, `src/lib/ai/providers.ts`, `src/lib/ai/validate-model.ts`, `src/lib/ai/asset-knowledge.ts`, `src/lib/research/provider.ts`, `src/features/captions/service.ts`, `src/app/api/ai/magic-prompt/route.ts`, `src/app/api/models/route.ts`, `src/app/api/assets/route.ts`, `tests/worker-recovery.test.ts`.

Criados: `src/lib/ai/audit.ts`, `src/lib/jobs/eligibility.ts`, `tests/ai-background-eligibility.test.ts`, `scripts/audit-ai-background.mjs`, `scripts/observe-ai-idle.mjs`, este relatório. Não houve migração nem alteração de triggers/dados de rotinas.

Diagnóstico somente de leitura: `node --env-file=.env.local scripts/audit-ai-background.mjs`. Observação local: `node --env-file=.env.local scripts/observe-ai-idle.mjs`, que aborta se detectar trabalho pendente/rotina ativa e apenas lê contadores/logs. Logs locais em `.local-logs/ai-audit-server.out.log` e `.local-logs/ai-audit-server.err.log` (ignorados pelo Git).
