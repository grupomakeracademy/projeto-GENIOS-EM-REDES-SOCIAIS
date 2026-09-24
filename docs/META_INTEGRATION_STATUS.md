# Registro e Continuidade do Projeto — Conexão Meta (Facebook & Instagram)

Este documento registra todas as implementações, correções de bugs, credenciais configuradas, conexões ativas e o status atual para permitir a continuidade imediata em sessões futuras.

---

## 1. Conexões Oficiais Ativas (Meta Graph API)

As contas estão conectadas e validadas com sucesso no banco de dados (`social_connections`):

- **Instagram Business Account**:
  - **Identificador**: `@grupomakeracademy`
  - **ID Externo (Meta)**: `17841408142610938`
  - **Página do Facebook Vinculada**: Grupo Maker Academy (`462924690828749`)
  - **Permissões Ativas**: `instagram_basic`, `instagram_content_publish`
  - **Status**: Conectado e verificado com token de longa duração (60 dias).

- **Página do Facebook**:
  - **Nome da Página**: `Geninhos`
  - **ID Externo (Meta)**: `1186202544568495`
  - **Permissões Ativas**: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`, `business_management`
  - **Status**: Conectado e verificado com Page Access Token de 60 dias.
  - **Publicação Real Confirmada**: Post ID `1186202544568495_122146608723347874` publicado com sucesso na página.

---

## 2. Configurações de Ambiente (`.env.local`)

As seguintes variáveis estão ativas e configuradas no `.env.local`:

```env
# Origem da Aplicação (OBRIGATÓRIO ser localhost para a Meta aceitar HTTP sem SSL)
APP_ORIGIN=http://localhost:3001

# Meta Developer App
META_CLIENT_ID=1657667375953494
META_CLIENT_SECRET=f0b7ca8ab2f31a3e12f0aaeee6226aac

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://ekkjaafhrrfsueeazudj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_DDdPi1_MKVv8nhDKC2OpJg_n1zgnxyu
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DATABASE_URL=postgresql://postgres.ekkjaafhrrfsueeazudj:KentinGenios123%23@aws-0-ca-central-1.pooler.supabase.com:5432/postgres

# Criptografia de Tokens e Autenticação
CREDENTIAL_MASTER_KEY=o5YwmtAPL9te3xMtXK4SLIhP0pYMBuTMijV+cUTQ9qI=
WORKER_SECRET=7kjQFxBQTexFfKTCs7xaqEWoHg/Pn2oNxiCgoYb6/+c=
LOCAL_SIGNUP_WITHOUT_EMAIL_CONFIRMATION=true

# Provedores de IA
OPENAI_API_KEY=sk-proj-uZOQvcg-...
```

---

## 3. Principais Problemas Solucionados

### A. Erro de "Conexão Não Segura" e "Domínio não incluído nos domínios do app"
- **Causa**: A Meta bloqueia o IP numérico `http://127.0.0.1:3001` por considerá-lo inseguro, exigindo estritamente `http://localhost:3001` para desenvolvimento local.
- **Solução**:
  - Forçado `localhost` em `src/app/api/auth/social/meta/authorize/route.ts` e `callback/route.ts`.
  - Configurado `localhost` em "Domínios do app" e `http://localhost:3001/` como URL do Site na Meta.
  - Configurado `http://localhost:3001/api/auth/social/meta/callback` em "URIs de redirecionamento do OAuth válidos".

### B. Erro "Nenhuma Página do Facebook encontrada no seu perfil" (Granular Scopes)
- **Causa**: No tipo de aplicativo "Empresa" (Facebook Login for Business), a chamada `/me/accounts` retorna `data: []` porque a Meta utiliza **Escopos Granulares**. Os IDs autorizados ficam dentro de `debug_token` (`granular_scopes`).
- **Solução**:
  - Implementada inspeção profunda via `debug_token` em `src/app/api/auth/social/meta/callback/route.ts`.
  - O callback agora busca individualmente cada ID granular concedido (`/${pageId}` e `/${igId}`), capturando os tokens específicos de cada página e conta do Instagram.

### C. Erro "Canal Facebook não conectado" na tela do Conteúdo
- **Causa**: Em `src/app/(workspace)/contents/[id]/page.tsx`, as conexões estavam sendo consultadas via `ctx.db` (cliente restrito por RLS), retornando lista vazia.
- **Solução**: Alterado para usar `adminClient().from('social_connections')`, que é o mesmo cliente usado pela página `/channels`.

### D. Erro `social_publish_failed` após publicar nas Redes Sociais
- **Causa Raiz Identificada**:
  1. O envio para a Meta (Facebook/Instagram) ocorria com sucesso (o post chegava a entrar no ar na página).
  2. No entanto, ao salvar o status `PUBLISHED` no banco:
     - A trigger `variant_guard` em `content_variants` detectava a alteração do registro e, por considerar qualquer alteração como edição de rascunho, resetava `content_items.status` de volta para `AWAITING_REVIEW`.
     - Em seguida, a trigger `enforce_content_transition` em `content_items` bloqueava a transição de `AWAITING_REVIEW -> PUBLISHED` (e também bloqueava `APPROVED -> PUBLISHED`), disparando exceção `invalid transition`.
     - Essa exceção do PostgreSQL era capturada pelo endpoint `/api/content/[id]` que retornava o erro `social_publish_failed` para a interface.
- **Solução Aplicada**:
  - Criada e aplicada a migração [`supabase/migrations/202609220001_fix_publish_transitions.sql`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/supabase/migrations/202609220001_fix_publish_transitions.sql):
    - Atualizada a trigger `variant_guard`: alterações apenas de `status`, `published_at` e `scheduled_at` não resetam mais o item para `AWAITING_REVIEW`, nem são travadas por `content locked`.
    - Atualizada a trigger `enforce_content_transition`: adicionadas as transições para `PUBLISHED` (e `PUBLISHING`) a partir de `APPROVED`, `SCHEDULED`, `ROUTINE` e `AWAITING_REVIEW`.
  - Atualizado [`src/lib/domain.ts`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/lib/domain.ts) para permitir essas transições no mapa de regras do domínio.
  - Atualizado [`src/lib/social/publisher.ts`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/lib/social/publisher.ts) para marcar `content_items` como `PUBLISHED` quando todas as variantes forem publicadas.
  - Atualizado [`src/features/content/detail.tsx`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/features/content/detail.tsx) para exibir um card de confirmação com link direto para a publicação na rede social.

### E. Opções de Logout e Troca de Conta
- **Solução**:
  - Adicionado botão visível **`Sair`** na Topbar (`src/components/shell.tsx`).
  - Adicionada opção **"Trocar de conta da Meta"** no modal de conexão de canais (`src/features/channels/view.tsx`) com parâmetro `&reauth=1` (`auth_type=reauthenticate,rerequest`).

---

## 4. Arquivos Modificados e Mantidos

1. [`src/app/api/auth/social/meta/authorize/route.ts`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/app/api/auth/social/meta/authorize/route.ts)
   - Resolução de `localhost`, suporte a `reauth`, escopos completos (`business_management`, `pages_manage_posts`, etc.).
2. [`src/app/api/auth/social/meta/callback/route.ts`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/app/api/auth/social/meta/callback/route.ts)
   - Troca de token de 60 dias, resolução via `granular_scopes`, suporte a páginas de empresas e contas do Instagram.
3. [`src/app/(workspace)/contents/[id]/page.tsx`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/app/(workspace)/contents/[id]/page.tsx)
   - Uso de `adminClient()` para carregar conexões sociais sem bloqueio de RLS.
4. [`src/features/content/detail.tsx`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/features/content/detail.tsx)
   - Correspondência de conexão por `agent_id` e `channel`.
5. [`src/lib/social/publisher.ts`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/lib/social/publisher.ts)
   - Correção do nome da coluna para `updated_at` na atualização de `content_items`.
6. [`src/app/api/content/[id]/route.ts`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/app/api/content/[id]/route.ts)
   - Resposta imediata de sucesso na ação `publish`.
7. [`src/components/shell.tsx`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/components/shell.tsx)
   - Botão de logout no cabeçalho superior.
8. [`src/features/channels/view.tsx`](file:///e:/LocalSend/Agentes/AGI-local/projeto-GENIOS-EM-REDES-SOCIAIS/src/features/channels/view.tsx)
   - Opção de troca de conta da Meta no modal.

---

## 5. Como Retomar os Trabalhos

1. **Iniciar o Servidor de Desenvolvimento**:
   ```bash
   npm run dev
   ```
   Acesse sempre via: **`http://localhost:3001`** (não utilize `127.0.0.1` para manter a compatibilidade com a Meta).

2. **Fluxo de Publicação**:
   - Vá em **Conteúdos** (`/contents`).
   - Abra qualquer post aprovado ou crie um novo.
   - O canal estará indicado como verde (`Geninhos` ou `@grupomakeracademy`).
   - Clique em **"Publicar agora"** ou defina uma data e clique em **"Agendar postagem"**.
