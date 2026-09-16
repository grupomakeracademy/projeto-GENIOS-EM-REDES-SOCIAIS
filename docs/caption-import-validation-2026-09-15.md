# Edição de legendas e gestão de importações

Implementação aditiva aplicada ao banco configurado (migrações 202609150002 e 202609150003).

## Entrega

- Editor compartilhado: Copiar texto → Prompt Mágico → Storytelling → Salvar alterações.
- Primeiro sucesso gratuito de cada recurso, por conteúdo/importação. Sucessos seguintes custam 1 cota.
- Operações persistidas e idempotentes; concorrência protegida no banco. Saldo e lançamentos continuam em `profiles` e `quota_transactions`, via `deduct_content_quota`.
- Falhas não incrementam o uso nem concluem o débito. Uma insuficiência de saldo ocorrida durante a chamada também impede a entrega/cobrança. A legenda anterior permanece no editor.
- Storytelling exige três blocos separados e recebe somente contexto textual selecionado. Instruções proíbem fatos inventados. Não há análise de imagem.
- Salvar alterações persiste somente legenda; salvar rascunho persiste os campos da importação. Nenhum desses comandos publica, agenda ou debita cotas.
- Histórico recente limitado no servidor a cinco registros. Histórico completo com 20 itens por página, busca, status e filtro do vínculo real com agente.
- Visualizar troca o preview; Abrir restaura a importação; Excluir exige confirmação e faz exclusão lógica, preservando arquivos compartilhados e auditoria.
- Exclusão cancela jobs pendentes vinculados, limpa agendamento associado e recusa exclusão durante publicação/processamento em curso. Não remove posts de redes sociais.
- Publicado exige evidência de publicação externa; agendado depende do agendamento futuro existente.

## Estruturas reutilizadas

`AIService.text`, autenticação/guard e RLS, `profiles`, `quota_transactions`, `deduct_content_quota`, `content_items`, `content_variants`, `content_media`, publicação/agendamento existentes, `Modal`, `Notice`, `Button`, `SocialLogo` e evento `quota-updated` do cabeçalho.

`caption_operations` guarda estado, resultado e idempotência das operações textuais; não é outro saldo ou ledger financeiro. `import_overview` deriva o status dos dados existentes. Não foi criado pipeline de publicação.

## Arquivos principais desta etapa

- `src/features/captions/editor.tsx`, `service.ts`
- `src/app/api/captions/route.ts`
- `src/features/content/detail.tsx`
- `src/features/imports/view.tsx`, `all.tsx`, `service.ts`, `view.module.css`
- `src/app/api/imports/route.ts`, `[id]/route.ts`
- `src/app/(workspace)/import/all/page.tsx`
- Migrações `202609150002_caption_import_management.sql`, `202609150003_import_caption_save.sql` e scripts correspondentes.
- Testes `captions.test.ts`, `import-history.test.ts`, `database.test.ts`, atualização de `imports.test.ts`.

## Evidências

75 testes passaram em oito suítes: database, captions, imports, import-history, import-pagination, domain, routine-content-quota e worker-recovery. A suíte de banco foi repetida após o ajuste de salvar apenas a legenda: 23/23 passaram. TypeScript (`tsc --noEmit`) e ESLint dos módulos novos/alterados de legendas e importações passaram.

Validação na interface autenticada:

- Upload da imagem fornecida pelo usuário, original 720×1280; preview observado em 314×558, mantendo proporção.
- Rascunho com título e legenda salvo e reaberto corretamente.
- Copiar texto confirmou sucesso.
- Busca por título retornou somente o rascunho de teste.
- Visualizar alterou o preview mantendo `/import/all`.
- Cancelar exclusão preservou o item. Exclusão do rascunho criado para o teste atualizou lista, contador e preview sem F5.
- Os dois registros preexistentes permaneceram no histórico.
- Conteúdos abriu normalmente. Em um conteúdo aprovado foram observados os quatro botões na ordem exigida, sem Regenerar texto.
- Saldo observado: 158 cotas antes e depois das ações sem IA.

## Limites da validação

Não houve chamada real a API de texto, imagem ou Vision nesta etapa. IA e cobrança foram testadas com mocks e PostgreSQL local em memória. Portanto, não se atribui a um modelo real qualquer resultado narrativo avaliado aqui.

Publicação externa não foi executada. Os conectores atuais informam indisponibilidade de publicação/agendamento automáticos; essa restrição preexistente foi preservada, sem simular publicação. Geração de imagem, rotinas, canais e Biblioteca não receberam mudanças funcionais nesta etapa. Os testes de regressão selecionados passaram; isso não equivale a teste manual integral de todos os módulos.
