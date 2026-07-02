---
bloco: bloco-funil-turno-orquestracao
branch: fix/turno-governanca-dado-erro
workspace: fix-turno-governanca-dado-erro
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-186, FIX-187]
escopo_arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/action-policy.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/adapters/bevi/bevi-errors.ts
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "orchestrator/index.ts + runner.ts: a ONDA 2 (bloco-streaming-chat-layer) toca a CAMADA de composição/streaming (como o texto vira bolha). Esta ONDA 1 toca a LÓGICA do turno (erro→diretiva, precondição de gate). A onda 2 é serializada (forka da base já com esta onda integrada) → conflito mínimo/nenhum. Ordem de merge: onda 1 (esta) → onda 2."
---
# Bloco — Funil / orquestração do turno (governança determinística de DADO e ERRO)

## Por que estes itens estão juntos

Os dois itens são a **lógica determinística do turno**: o que o agente FAZ quando a
descoberta na Bevi falha (FIX-186) e sob que condição ele PODE propor/decidir (FIX-187).
São o "coração" da correção do print do Kairo (agente narrou vários "deixa eu buscar",
narrou o erro cru e mesmo assim mostrou uma proposta). Tocam a mesma família de arquivos
do orchestrator (`ai-sdk.ts`, `action-policy.ts`, `artifact-guard.ts`) → 1 dev, 1 sessão.

A **higiene de exibição** (preâmbulo efêmero, sanitizer, segmentação de bolha) é a **onda 2**
(`bloco-streaming-chat-layer`), serializada. Racional da ordem: quando esta onda transforma o
erro de descoberta em **diretiva** (FIX-186), o modelo deixa de narrar erro cru — então o
sanitizer da onda 2 só precisa cuidar de preâmbulo de **sucesso**, não de narração de erro.
Fazer a governança de dado primeiro reduz a superfície da onda 2.

## Ordem interna
1. **FIX-186** — erro de descoberta Bevi vira diretiva determinística (retry + fallback humano).
2. **FIX-187** — gate de proposta/recommendation/simulation exige descoberta bem-sucedida no
   turno atual (depois do 186, o sinal "turno teve erro de descoberta" já existe pra o 187 ler).

## Evidências no `_evidencia/` (triar como parte do tema)
- `agente-meta-narrativa-search-groups-falha-print.png` — **é o print** (FIX-186/187).
- `agente-trava-apos-valor-print.png` / `valor-componente-nao-aparece-print.png` — bugs
  IRMÃOS de orquestração do turno (o agente confirma o valor e não avança / o artifact de
  valor não renderiza). **NÃO investigados no diagnóstico desta rodada.** Se sobrar tempo na
  sessão E a causa for a mesma família (avanço de gate determinístico em `qualify-state.ts`/
  `orchestrator/index.ts`), abra `fix-NN` novo e trate; senão, deixe a evidência aqui e
  registre no `.done/` como "triado, fica pra próxima rodada" — NÃO invente root cause.
