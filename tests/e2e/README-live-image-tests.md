# Testes reais de imagem

Os testes E2E que acionam geração real de imagem exigem um destino de revisão configurado em `.env.local`:

```text
LIVE_TEST_REVIEW_WORKSPACE_ID=<workspace da conta que deve receber os resultados>
LIVE_TEST_REVIEW_AGENT_ID=<agente dessa workspace>
LIVE_TEST_REVIEW_USER_ID=<usuário membro dessa workspace>
```

Sem essas variáveis, os cenários de geração real são ignorados antes de criar um job. Os testes `content-reference-live`, `content-visual-corrections-live`, `publication-type` e `routine-portability` copiam cada imagem gerada para um conteúdo identificado como teste, com status `AWAITING_REVIEW`, no destino configurado. A cópia utiliza a reserva normal de armazenamento da conta. Se a cópia falhar, o teste mantém a workspace de origem para investigação e não apaga o arquivo gerado.

Os identificadores devem ser obtidos da instalação de destino; não versionar `.env.local` ou credenciais.
