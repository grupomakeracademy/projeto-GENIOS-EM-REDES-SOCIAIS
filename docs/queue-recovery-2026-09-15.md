# Recuperação da fila e dos erros de imagem — 15/09/2026

## Diagnóstico comprovado

- O worker externo havia encerrado durante a inicialização do tsx (`uv_os_get_passwd`, `ENOMEM`). O servidor continuava aceitando solicitações sem consumir a fila.
- O job `3ab51ff8-223d-4e80-8dfb-134d610e84e6` estava PENDING, com zero tentativas. Após ativar o consumidor, revelou outro bloqueio: `runPipeline` recusava qualquer agente com `active=false`. No editor, esse campo é controlado pelo interruptor da rotina, portanto uma rotina desligada impedia indevidamente a criação manual.
- Os jobs `11bcabc2-2bc1-4eb1-aab3-1968c037ce88` e `3e2b5860-c0f9-4a1e-9924-318844377c74` tinham falhado na etapa IMAGE_GENERATION. Os textos já estavam nos checkpoints. O motivo específico original não foi preservado; não é possível afirmar retrospectivamente se foi recusa HTTP ou resposta incompleta.
- O adaptador classificava genericamente recusas HTTP como `invalid_output` e tentava gerar sem referências após qualquer falha de edição. O consumidor não repetia respostas incompletas.

## Correções

- Consumidor iniciado automaticamente com o servidor Node, via instrumentation do Next. Uma execução por vez por processo, polling após a conclusão e recuperação após falhas temporárias. O banco continua protegendo concorrência com leases.
- O script Windows deixa de abrir um processo tsx separado.
- Criação manual autorizada mesmo com rotina desligada. Agendamentos exigem schedule habilitado e agente ativo; mantidos dia, hora e fuso cadastrados.
- Resposta incompleta permite repetição limitada por `max_attempts`, com espera e reutilização de checkpoints. Recusas permanentes de configuração, política e saldo não repetem indefinidamente.
- Falhas HTTP recebem classificação específica e diagnóstico seguro (operação, status, código e parâmetro), persistido no checkpoint. Sem corpo de resposta, chave ou prompt nos novos diagnósticos.
- Uma edição recusada não dispara automaticamente outra geração sem as referências protegidas.

## Verificação

42 testes locais: runner, worker, criação manual com rotina desligada, providers com fetch mockado, agendamento, proteção de logo e persistência pós-composição. TypeScript e lint dos arquivos de execução/testes alterados passaram.

Depois da autorização explícita para retomar APIs, foram retomados os três conteúdos existentes. Consulta ao banco às 14:21:06 UTC confirmou todos COMPLETED, uma tentativa após retomada, `last_error=null`, etapa COMPLETED e conteúdo AWAITING_REVIEW:

| Job | Conclusão UTC |
| --- | --- |
| 3ab51ff8-223d-4e80-8dfb-134d610e84e6 | 14:18:38 |
| 11bcabc2-2bc1-4eb1-aab3-1968c037ce88 | 14:20:24 |
| 3e2b5860-c0f9-4a1e-9924-318844377c74 | 14:21:03 |

Evidência local: `scratch/queue-recovery-result.json`; logs em `.local-logs/server.log` e `.local-logs/server-error.log`. Os testes automatizados não chamaram IA. A retomada operacional autorizada consumiu as APIs configuradas.

O agendamento atual do agente está desativado (`enabled=false`, `active=false`), terça e quarta, 08:00, America/Sao_Paulo. Nenhum interruptor de rotina foi ligado sem solicitação. O consumidor está ativo para as rotinas que o usuário habilitar.

## Operação

Com o servidor ligado, a fila funciona sem navegador aberto ou worker manual. Um computador desligado não executa código: operação 24h exige hospedagem contínua com supervisão do processo. Em serverless, configurar explicitamente JOBS_RUNNER_MODE=external e um agendador autenticado. Não há alegação de garantia de sucesso de toda resposta futura do provedor.
