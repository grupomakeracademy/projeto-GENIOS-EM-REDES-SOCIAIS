# Entrega das cinco otimizações — 24/09/2026

## Dashboard e filtros

- `NetworkFilter` compartilha o padrão de controle de Conteúdos entre Conteúdos e Dashboard, com caixas de seleção, Todas e combinações de redes.
- Redes aplicáveis vêm do workspace. O filtro de agente existente foi reutilizado.
- As contagens combinam redes e intervalo de datas no fuso do workspace. Publicados e agendados usam suas datas específicas.
- Saudação sem emoji; ícones Lucide sem caixas coloridas, com ajustes de contraste.
- Alcance, engajamento e seguidores continuam exibindo indisponibilidade: o Dashboard existente não tinha uma fonte de métricas reais para esses valores. Não foram criados números fictícios.

## Calendário

A grade antiga dependia de `scheduled_at`, enquanto outras áreas usavam `created_at` e consultas diferentes. Isso excluía publicações sem agendamento da grade e produzia contadores e próximos conteúdos inconsistentes.

`datedContents`, `statusDate` e `monthSummary` centralizam consultas e datas. Publicação usa timestamps das variantes/recibos e, na ausência deles, eventos PUBLISH/PUBLISHED; agendamento usa `scheduled_at`; outros estados usam a entrada no estado registrada em `content_events`. Rascunhos podem usar sua criação. O filtro Todos mostra a data do estado atual de cada conteúdo. Eventos anteriores continuam armazenados; mudanças de agendamento passam a guardar o valor anterior no evento.

Publicados são excluídos de Próximos conteúdos. Grade, resumo e distribuição por rede derivam dos mesmos dados e respeitam o fuso do workspace.

Auditoria remota: existem três itens marcados PUBLISHED, dos quais dois possuem data em variantes, recibos ou eventos. Um registro legado não possui essa evidência. Sua data não foi inventada: ele não pode ser associado honestamente a um dia/mês até que a data real seja recuperada. Nenhum histórico foi removido.

## Vídeo

- Importar aceita um MP4 de até 524.288.000 bytes (500 MB na convenção binária já usada pelo projeto).
- Novo vídeo substitui o vídeo do rascunho; múltiplos vídeos e misturas com imagens são rejeitados.
- Estrutura existente reutilizada: `content_imports.images`, `content_media`, `finalize_content_import`, publicador, jobs e conectores.
- Parser de MP4 obtém dimensões e rotação; preview usa vídeo nativo e `object-fit: contain`. Os bytes originais são armazenados, sem IA, compressão ou conversão.
- Imagens continuam usando o fluxo de 1–6 slides.
- Capabilities são calculadas no servidor a partir do conector e dos metadados da conexão, e verificadas novamente ao publicar/agendar.
- Instagram Business: Feed (publicado como Reel), Stories e Ambos. Conta de criador ou tipo desconhecido: Feed. Outros conectores sem implementação de vídeo: opções de vídeo indisponíveis. Conexões demo não publicam nem agendam.
- Ambos usa recibos por destino para reaproveitar publicações já concluídas em novas tentativas.
- Substituição mantém o arquivo antigo até salvar o novo; durante essa operação ambos ocupam espaço físico. A exclusão efetiva libera o antigo. Se a remoção falhar, o arquivo retido continua contabilizado e o erro é registrado.

## Armazenamento geral

`profiles.storage_quota_mb` foi reutilizado como único limite administrativo. Novos perfis recebem 2048 MB; limites existentes, inclusive 100 MB, valores personalizados e ilimitados, foram mantidos.

`account_storage_objects` contabiliza uma entrada por caminho físico. `account_storage_usage` fornece uso e reservas. Biblioteca, Conteúdos (incluindo originais e versões persistidas) e Importar usam `uploadAccountFile`.

Reservas são feitas por função restrita ao servidor, sob bloqueio da linha da conta. O gatilho de Storage verifica reserva, tamanho final e exclusão, incluindo o ciclo real em duas etapas do Storage. Atualizações diretas da cota pelo próprio usuário são bloqueadas. O Super Admin reutiliza o controle existente para armazenamento total.

Na migração, 288 objetos foram reconciliados, somando 497.738.912 bytes. A atribuição usa o autor existente quando disponível e o criador do workspace como alternativa. Arquivos, permissões e limites existentes foram preservados. O backfill interrompe a execução caso encontre objetos abrangidos sem workspace ou tamanho.

## Migrações aplicadas no Supabase

1. `202609240001_import_video_and_events.sql`: MP4, validação/substituição de importações, histórico e campos de publicação.
2. `202609240002_account_storage.sql`: limite padrão, ledger, backfill, reservas e proteção de cota.
3. `202609240003_storage_upload_lifecycle.sql`: compatibilidade do gatilho com criação/finalização do objeto pelo Storage real.

Executor idempotente: `node --env-file=.env.local scripts/migrate-five-optimizations.mjs`. A opção `--dry-run` valida e faz rollback. As duas primeiras migrações foram validadas dessa forma antes de sua aplicação. As três estão registradas em `supabase_migrations.schema_migrations`.

## Validação executada

- Vitest: 36 arquivos, 258 testes aprovados.
- TypeScript: aprovado.
- Build de produção Next.js: aprovado.
- Interface isolada com componentes reais: Light, Dark e System; seleção múltipla e Todas; publicação no dia correto; reprodução real de MP4 180×320 com proporção preservada.
- Conector Instagram: Feed, Stories e Ambos verificados com respostas HTTP simuladas. Não houve publicação em rede social real.
- Banco local PGlite: cotas, preservação de limites, reserva/concorrência lógica, bypass, substituição, exclusão e ciclo de upload em duas fases. Não equivale a teste de carga com múltiplas conexões PostgreSQL.
- Supabase real: migrações, leitura das novas estruturas e upload de um arquivo temporário pequeno, conferência exata dos bytes, exclusão física e liberação da cota. O arquivo temporário foi removido.
- Chave pública e acesso administrativo verificados sem expor credenciais.
- ESLint global ainda apresenta erros em áreas existentes; não é uma validação integral aprovada. Os novos erros identificados no Dashboard e no teste de armazenamento foram corrigidos.

Limites de validação: o limite de 500 MB foi testado logicamente, sem transferir um arquivo de 500 MB. Limites do plano Supabase e do servidor/proxy de implantação precisam comportar esse tamanho. Publicação real, processamento pela Meta e disparo real de agendamento não foram executados. Os testes de UI foram isolados, sem sessão autenticada completa. A suíte de regressão passou; isso não constitui garantia de todas as integrações externas.

## Arquivos envolvidos

- Dashboard/filtros: `src/app/(workspace)/dashboard/page.tsx`, `src/app/(workspace)/contents/page.tsx`, `src/features/dashboard/{view.tsx,metrics.ts,period-filter.tsx}`, `src/features/content/{list.tsx,queries.ts}`, `src/components/network-filter.tsx`, `src/lib/{network-filter.ts,applicable-networks.ts}`.
- Calendário: `src/app/(workspace)/calendar/page.tsx`, `src/features/calendar/{view.tsx,data.ts,dates.ts}`.
- Importar/vídeo: `src/app/api/imports/{route.ts,[id]/route.ts}`, `src/features/imports/{all.tsx,images.ts,preview.tsx,service.ts,video.ts,view.tsx,view.module.css}`, `src/features/content/{cards.tsx,detail.tsx}`.
- Integrações: `src/app/api/channels/route.ts`, `src/app/api/auth/social/meta/callback/route.ts`, `src/lib/social/{connectors.ts,connection-capabilities.ts,publisher.ts}`.
- Cota: `src/lib/account-storage.ts`, `src/lib/jobs/save-composited-image.ts`, `src/lib/super-admin/users-service.ts`, `src/app/(workspace)/library/page.tsx`, `src/app/api/assets/{route.ts,quota/route.ts}`, `src/features/library/view.tsx`, `src/features/settings/view.tsx`.
- Configuração/estilo: `next.config.ts`, `src/app/globals.css`. `next-env.d.ts` é gerado pelo Next.
- Banco/operação: as três migrações acima, `scripts/migrate-five-optimizations.mjs`, `scripts/verify-account-storage.mjs`.
- Testes: `tests/{database.test.ts,exact-logo-persistence.test.ts,imports.test.ts,social-connectors.test.ts,account-storage.test.ts,dashboard-calendar-video.test.ts,ui-optimizations.mjs}`, `tests/fixtures/mp4.ts`.

As mudanças foram mantidas nas cinco áreas solicitadas e seus pontos de integração. Não foi feita refatoração ampla. O código local ainda precisa ser publicado pelo fluxo de deploy habitual; as migrações já foram aplicadas ao Supabase informado.
