# Ajustes pontuais — 24/09/2026

## Estado da entrega

As três alterações estão implementadas. Após a atualização da credencial pelo usuário, os dois arquivos foram processados pelo serviço real e seus resultados foram confirmados no Supabase. Nenhum ativo foi marcado artificialmente como processado.

## 1. Indicador global de armazenamento

- Novo `StorageBadge`, imediatamente antes de `QuotaBadge` no `Shell` global.
- Formato: `300 MB de 2 GB (14,6%)`, com conversão dinâmica MB/GB; contas ilimitadas mostram `de ilimitado`, sem inventar percentual.
- Reutiliza `/api/assets/quota` e `accountStorage`, exatamente a fonte usada pela Biblioteca. `summary=1` apenas evita carregar a listagem administrativa de outros usuários.
- Operações bem-sucedidas feitas pelo helper `api` emitem `storage-updated`. O indicador também atualiza ao recuperar foco/visibilidade e a cada 15 segundos para captar tarefas de backend ou ajustes feitos em outra sessão.
- Nenhuma tabela, saldo ou regra de cota nova. O cartão de armazenamento da Biblioteca foi preservado.
- Usa as cores existentes dos temas.

## 2. Auditoria do DNA Visual Geral

### Causa confirmada

Os dois ativos da imagem, `photo_2026-09-21_14-30-47.jpg` e `photo_2026-09-21_14-30-50.jpg`, estão na categoria `reference` e registravam `processing_status=failed`, `processing_error=authentication_error`, sem modelo ou data de processamento concluído.

Ambos foram baixados do Storage real: JPEG válido, 960×1280, respectivamente 287.748 e 279.005 bytes, iguais aos tamanhos cadastrados. A falha não é ausência do arquivo ou tamanho divergente.

O serviço utiliza `serverCredential('openai')`, que lê `OPENAI_API_KEY`/`OPENAI_KEY` do servidor. A primeira chamada de autenticação ao provedor retornou **HTTP 401 / invalid_api_key**. Após a atualização da chave pelo usuário, a mesma verificação retornou **HTTP 200**. A credencial não foi exposta nos logs nem neste relatório.

### Fluxo e correções

`Library.handleReprocess` → `PATCH /api/assets` com `{action:'reprocess',id}` → `guard('write')` e busca no workspace autenticado → `processAssetKnowledge` → download privado no bucket existente → hash → `apiJSON` → parsing Zod → atualização de `assets`.

O agente não é necessário no payload de processamento: a interpretação pertence ao ativo. As associações ao agente continuam sendo gerenciadas pelo fluxo existente, sem alteração.

O modelo visual existente é `gpt-4o-mini` (ou `OPENAI_VISION_MODEL` configurado), com imagem base64, MIME cadastrado, detalhe alto e saída JSON Schema estrita. O timeout existente de `apiJSON` é 180 segundos; não foram adicionados retries automáticos ou outro provedor/modelo.

Problemas adicionais encontrados e corrigidos:

- O endpoint devolvia HTTP 200 e `ok:true` mesmo quando o serviço retornava `status:failed`. Agora devolve HTTP 502 e uma mensagem compreensível.
- O frontend apenas escrevia o erro no console. Agora apresenta alerta e atualiza os dados do ativo após sucesso ou falha.
- Escritas de status e resultado no banco ignoravam erros. Agora são verificadas antes de anunciar sucesso, incluindo deduplicação e persistência final.
- Erros passam a usar códigos seguros; logs registram ativo, workspace, categoria, MIME, modelo, etapa e diagnóstico estruturado do provedor. Respostas e tooltips não exibem mensagens internas arbitrárias.
- Interpretações inválidas e falhas de armazenamento/persistência recebem mensagens específicas. Resultado só é anunciado como processado após a escrita bem-sucedida.

Identidade Protegida e Asset Exato compartilham o endpoint e serviço, mas mantêm o desvio existente que utiliza o arquivo diretamente, sem visão/IA. Foram testados para garantir zero chamadas ao modelo e nenhum download desnecessário.

**Validação real concluída:** `processAssetKnowledge` processou os dois arquivos com `gpt-4o-mini`, uma chamada por arquivo. Leituras independentes no Supabase confirmaram `processing_status=processed`, `processing_error=null`, interpretação estruturada, resumo e timestamps. O primeiro resumo possui 1.445 caracteres (19:33:33 UTC); o segundo possui 1.353 caracteres (19:33:53 UTC), em 24/09/2026. A execução foi feita diretamente pelo mesmo serviço utilizado no endpoint, sem fabricar uma sessão do usuário.

## 3. Universidade

- A página usava `ctx.role !== 'VIEWER'` e começava com `canEdit=true`; agora usa `isSuperAdmin(ctx.user)` e falha com permissão desativada.
- Componentes existentes `UniversityList`, `UniversityPlayer` e `UniversityForm` foram reutilizados. Os dois primeiros já condicionavam botões a `canEdit`.
- Formulários de criação/edição também exigem `canEdit`, inclusive URLs `?new=1` e `?edit=...`; callbacks administrativos verificam a mesma permissão.
- POST/PATCH/DELETE reutilizam `guard` para sessão/origem/limite e `requireSuperAdmin` para autorização. Administradores de workspace, editores e visualizadores comuns recebem 403 antes de qualquer escrita ou upload.
- O preenchimento automático inicial não grava dados em visitas de usuários comuns.
- Migração `202609240004_university_admin_only.sql` aplicada no Supabase: revoga escrita direta de `authenticated`/`anon` na tabela. Super Admin continua gerenciando pelos endpoints de servidor autorizados. Leitura e registros foram preservados.
- Listagem, ordenação, thumbnails, player, título e descrição permanecem nos componentes existentes.

## Testes e resultados

- Suíte completa: **277 testes aprovados em 38 arquivos**, seguida de **5 testes adicionais aprovados** para o endpoint de processamento.
- TypeScript e build de produção: aprovados.
- Lint dos novos componentes/helpers e testes inicialmente adicionados, além do endpoint Universidade: aprovado. Não se afirma que o lint global legado esteja limpo.
- Serviço de processamento real sob mocks de banco/provedor: download, payload base64, parsing, resultado/status, recusa de credencial, falha de persistência, JSON inválido, Storage indisponível e categorias sem IA.
- Endpoint de processamento: sucesso correto, erro HTTP 502 com mensagem útil, isolamento de ativo e desvio das categorias protegidas.
- Endpoints Universidade: POST/PATCH/DELETE negados para ADMIN/EDITOR/VIEWER comuns e permitidos ao Super Admin.
- Banco remoto: INSERT/UPDATE/DELETE com role `authenticated` foram recusados com erro de permissão em transação revertida. SELECT continua autorizado.
- Navegador com componentes reais e dados simulados: posição do indicador, valores/percentual e atualização após upload/exclusão/ajuste de limite; screenshots Light/Dark; URLs administrativas bloqueadas; lista/título/descrição preservados; clique no player gera iframe; controles e formulários presentes para Super Admin.
- OpenAI e Supabase reais: dois arquivos processados com sucesso e resultados persistidos, após atualização da chave. O clique autenticado no botão da Biblioteca não foi repetido: endpoint e frontend foram validados separadamente do serviço real.
- O teste do player confirma a manutenção do fluxo de abertura, não a disponibilidade do vídeo hospedado externamente.

## Arquivos deste novo escopo

- `src/components/storage-badge.tsx` (novo), `src/components/shell.tsx`, `src/components/ui.tsx`, `src/app/globals.css`.
- `src/app/api/assets/quota/route.ts` (consulta compacta da mesma fonte).
- `src/lib/ai/asset-processing-errors.ts` (novo), `src/lib/ai/asset-knowledge.ts`, `src/app/api/assets/route.ts`, `src/features/library/view.tsx`.
- `src/app/(workspace)/university/page.tsx`, `src/app/api/university/route.ts`, `src/features/university/view.tsx`.
- `supabase/migrations/202609240004_university_admin_only.sql` (nova, aplicada).
- `tests/asset-processing-flow.test.ts`, `tests/assets-reprocess-route.test.ts`, `tests/university-permissions.test.ts`, `tests/ui-targeted-adjustments.mjs` (novos).
- Este relatório. Arquivos já alterados no escopo anterior foram preservados.

Não houve redesenho da Biblioteca/Universidade nem substituição dos serviços de armazenamento, processamento ou autorização. A regressão automatizada passou. A aplicação ainda depende do deploy habitual para levar o código ao servidor de produção; a migração de permissões já está aplicada no banco informado.
