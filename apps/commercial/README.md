# Site comercial

Aplicação Next.js independente no repositório existente. Reutiliza as dependências instaladas na raiz, sem importar módulos da aplicação privada. Layout, build, runtime e ambiente próprios. O login existente é somente um destino de navegação.

Na raiz: `npm run commercial:dev` (porta 3000), `npm run commercial:build` e `npm run commercial:start`. O sistema privado continua na porta 3001 com os comandos anteriores. Nenhum worker é necessário no site público.

## Ambiente e implantação

Use apenas as variáveis de `.env.example` desta pasta. Não copie o ambiente privado. No deploy, execute cada aplicação em um processo separado; o público recebe exclusivamente URL/chave publicável Supabase e configurações comerciais. A aplicação pública não deve receber DATABASE_URL, service_role ou chaves de IA. Configure o domínio público como COMMERCIAL_ORIGIN e a URL HTTPS do login existente como PRIVATE_LOGIN_URL. O domínio comercial deve apontar para esta aplicação, e o subdomínio privado para a aplicação existente. Nenhum domínio ou provedor de hospedagem externo foi configurado automaticamente.

A migration `202609130003_commercial_leads.sql` é aplicada administrativamente, fora do runtime público. O helper `node --env-file=.env.local scripts/setup-commercial.mjs`, executado na raiz, aplica exclusivamente essa migration e cria o ambiente público com uma lista explícita de variáveis permitidas.

## Leads

POST /api/leads valida origem, limite real de 8 KB, schema, telefone, consentimento e honeypot. A RPC anônima `submit_commercial_lead` valida novamente no banco, não retorna dados pessoais, não acessa tabelas privadas e grava somente `commercial_leads`. A tabela tem RLS, sem acesso de leitura/escrita direta para anon/authenticated. Limites persistentes: 3 registros por e-mail/telefone por hora e 100 totais por hora, serializados por lock transacional. O UUID torna tentativas repetidas idempotentes. Esses limites não substituem proteção de borda contra ataques distribuídos em produção.

O WhatsApp só abre após confirmação do banco; a mensagem é codificada e contém o contexto. O navegador não envia a mensagem: o visitante confirma no WhatsApp. Em erro, o formulário mantém os valores; após sucesso, há link para continuar caso o aplicativo não abra. Não persistimos dados pessoais no armazenamento do navegador nem em logs.

Leads podem ser consultados pela administração no Supabase em `commercial_leads`. Dados de testes são removidos pelos scripts. Configure processo interno de atendimento, retenção e exclusão para operação comercial.

## Conteúdo e testes

O refinamento público usa Manrope variável hospedada localmente, com licença OFL em `public/fonts/OFL.txt`. As imagens WebP de `public/product` foram otimizadas a partir das capturas reais fornecidas pelo proprietário (Lista, Kanban, Rotina e Calendário). A demonstração do hero é uma animação local; não chama APIs de IA. Possui pausa, suspensão fora da tela e suporte a movimento reduzido. As apresentações do produto acompanham a rolagem nos dois sentidos, com alternância manual e ampliação; em celulares, permitem explorar a captura horizontalmente.

O componente de depoimentos está preparado para relatos reais, com pausa e alternativa sem movimento. Enquanto `testimonials` estiver vazio, não renderiza título, cards ou espaço reservado. Não adicionar depoimentos ilustrativos como se fossem clientes.

Depoimentos reais podem ser adicionados em `lib/content.ts`; a seção só aparece quando houver registros. Não há clientes ou resultados inventados. Referências à autopublicação distinguem compatibilidade oficial de habilitação da integração; WhatsApp é geração/distribuição.

`npx playwright test --config apps/commercial/playwright.config.ts` verifica o site nas portas locais. `node --env-file=.env.local scripts/commercial-smoke.mjs` testa persistência real, idempotência, limites e bloqueio de leitura anônima, limpando as fixtures.
