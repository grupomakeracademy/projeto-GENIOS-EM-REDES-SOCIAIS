# Auditoria da composição do logo — 15/09/2026

## Causa reproduzida

`set_asset_agents` permite compartilhar explicitamente assets entre workspaces por meio de `agents.visual_settings.reference_ids`. A seleção antiga adicionava `assets.workspace_id = agent.workspace_id`, excluindo um arquivo compartilhado mesmo quando vinculado. Sem referências, também selecionava todos os assets exatos do workspace. Essa combinação podia ignorar o arquivo escolhido ou aplicar outro arquivo. Os retornos sem overlay permitiam continuar com o buffer bruto.

O teste agora reproduz um logo vinculado de outro workspace, junto de um logo não vinculado do workspace do agente: somente o vinculado é selecionado. Assets não possuem coluna `active`; o vínculo persistido habilita seu uso. Mais de um logo vinculado exige resolver a ambiguidade, sem escolha arbitrária.

## Fluxos

- Manual e rotina: `runPipeline` chama `saveImage`, que chama `saveCompositedImage`.
- Regeneração: `regenerate` chama `saveCompositedImage`.
- A etapa compartilhada compõe antes de qualquer upload, salva o bruto em `-original.png` e retorna exclusivamente o caminho final.
- `content_media.storage_path` recebe o caminho retornado, com token da execução e sufixo `-final.png`, evitando cache de tentativas anteriores.
- Lista/cards, detalhe e API de atualização assinam esse storage_path via `mediaDisplaySource`. O helper recusa caminhos `-original.png`. Versões antigas continuam acessíveis, sem serem reinterpretadas como arquivos novos.
- A proteção anti-logo de prompt foi preservada. Não foi executada geração real.

## Evidência local (fixture, não cadastro consultado em produção)

```text
selectedExactAssetId: 33333333-3333-3333-3333-333333333333
selectedExactAssetName: GENINHOS - LOGO 02.png (fixture)
category: exact_asset
asset_subtype: logo
selectedExactAssetPlacement: bottom_left
selectedExactAssetScalePercent: 35
storage_path: fixture/official.png
assetWorkspaceId: owner-workspace
agentWorkspaceId: agent-workspace
explicitlyLinked: true
active: true
exactAssetBufferLoaded: true
exactAssetCompositionStarted: true
finalImageWidth: 1000
finalImageHeight: 1500
computedLogoWidth: 350
computedLogoHeight: 175
left: 50
top: 1250
exactAssetCompositionFinished: true
exactAssetApplied: true
providerRawImageSaved: true
finalImageSavedAfterComposition: true
uiUsingPostProcessedImage: true
finalDisplaySource: ...-final.png
```

O logo sintético tem proporção 2:1. Sua largura é 1000 × 0,35 = 350; altura = 175. Margens existentes de 5%: esquerda = 50; topo = 1500 − 175 − 75 = 1250. Testes inspecionam pixels internos e externos e comparam os buffers bruto/final, não apenas mensagens de log.

## Testes

`tests/exact-logo-persistence.test.ts`: 12 testes passaram, incluindo seleção com compartilhamento autorizado, exclusão de não vinculados, composição e armazenamento, falha por ausência/download/posição manual/duplicidade, proteção de URL bruta e execução das funções reais de imagem manual/rotina/regeneração com AIService mockado.

Também passaram `tests/image-logo-policy.test.ts` (7) e `tests/protected-identities-and-exact-assets.test.ts` (12). TypeScript e `git diff --check` passaram.

Nenhuma API paga foi usada. Nenhum job real, worker ou rotina foi disparado. A rede nos testes novos é bloqueada por mock de fetch.

## Limite da evidência

Os logs locais disponíveis não registravam o asset/job das capturas enviadas. Não foi consultado o banco remoto nem validado qual ID real gerou aquelas imagens. O defeito acima está demonstrado no código e reproduzido localmente; não é possível atribuir retrospectivamente cada imagem a ele só pela captura. As imagens já salvas não foram modificadas. O processo worker em execução não foi reiniciado, pois isso poderia consumir a fila e chamar APIs pagas; deve carregar esta versão antes da próxima execução real autorizada.
