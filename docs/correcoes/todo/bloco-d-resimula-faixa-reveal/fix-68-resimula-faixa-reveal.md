---
id: FIX-68
titulo: "Re-descoberta por mudança de valor na fase reveal (agent não consegue trocar de faixa)"
status: todo
bloco: bloco-d-resimula-faixa-reveal
arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/orchestrator/tool-policy.test.ts
  - src/lib/agent/system-prompt.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-22 — investigação dos logs do agent na develop (conversa a8b0a80d, "Maria")
---

## 1. Palavras do operador (Kairo)

> "ele começou mostrando uma cota, mas depois que pedi para mostrar outra ele não
> consegue buscar."

## 2. Cenário exato (conversa `a8b0a80d`, persona "Maria joaquina", canal web)

1. Pediu **R$ 256 mil / 60 meses / receber rápido** → agent rodou
   `search_groups → recommend_groups → simulate_quota → present_recommendation_card`
   → mostrou RODOBENS **308k / 96m** (id real `6a2b004ff9ec5c948e8c07d0`). ✅ funcionou.
2. Trocou a faixa: **"Valor do bem: R$ 130.000, Prazo: 60 meses"** → o agent foi
   direto pra `simulate_quota("auto-130k-60m")` **sem re-buscar** → erro.
3. A partir daí entrou em loop: *"esse grupo não está disponível"*, *"estou com
   dificuldade em acessar os grupos"*, *"instabilidade na busca"* — e chegou a
   **alucinar** ("sua última simulação: 308k/96m"). O erro se repetiu **6×** no
   mesmo `conversation_id` (`auto-130k-60m` 5×, `auto-256k-60m` 1×).

Evidência no log (estruturado):
```
{"level":"error","source":"discovery","tool":"simulate_quota",
 "conversation_id":"a8b0a80d-...","error_message":"Oferta/grupo \"auto-130k-60m\" não encontrado na descoberta atual."}
```
turn-traces dos turnos do erro: `toolsCalled:["simulate_quota"]`, `suppressed:[]`
(nada foi bloqueado — o agent simplesmente não tinha `search_groups` disponível).

## 3. Root cause INVESTIGADO (provado no código)

- `src/lib/agent/orchestrator/tool-policy.ts` — `phaseFromMeta` (linha 31-34) entra
  em fase **`reveal`** quando `meta.revealCompleted === true`. O `case "reveal":`
  (linha 109-120) retorna `[...BASE, ...WHAT_IF_AND_DETAIL, ...LEAD_CAPTURE,
  present_contemplation_dial, present_decision_prompt]` — **sem `DISCOVERY_AND_REVEAL_CARDS`**
  (que contém `search_groups`/`recommend_groups`). Foi removido de propósito pelo
  comentário `BUG-REVEAL-LOOP` (linha 110), pra evitar re-revelar cards em loop.
- Consequência: pós-reveal o agent só tem `simulate_quota` (de `WHAT_IF_AND_DETAIL`).
  Mas `simulate_quota` **não faz descoberta** — resolve `groupId` contra o
  `offerIndex` da busca ANTERIOR: `bevi-self-contract-adapter.ts:88` →
  `this.offerIndex.get(params.groupId)` → se não acha, lança (linha 90-94).
- O `offerIndex` (Map quotaId→oferta) só foi populado pela busca de **256k**
  (`ensureOffers` chaveia por `${segment}:${value}`, `bevi-self-contract-adapter.ts:145-176`).
  Nunca houve `simulate(130000)`, então nenhuma cota de 130k existe no índice.
- Sem `search_groups` na fase e sem id real de 130k, o agent **fabrica** o id
  `auto-130k-60m` (padrão `categoria-valor-prazo`; o `130k/60m` vem do analyzer no
  mesmo fluxo). `grep` confirmou: esse formato **não existe em lugar nenhum do
  código** — é alucinação da LLM, não id gerado.
- O comentário em `tool-policy.ts:64` ("what-if = re-simular com novo valor") é uma
  **premissa falsa**: `simulate_quota` recebe `groupId`, não valor — não há como
  re-simular um valor novo sem `search_groups`. A troca de faixa pós-reveal nunca
  foi implementável com as tools disponíveis em `reveal`.

## 4. Correção proposta

| O quê | Onde |
|---|---|
| Reabilitar `search_groups` (e o necessário do reveal, ex. `recommend_groups`/`present_recommendation_card`) na fase `reveal` **somente quando o valor-alvo mudou** vs a última descoberta — guard que distingue "trocar de faixa" (legítimo) de "re-revelar a mesma faixa em loop" (o BUG-REVEAL-LOOP que NÃO pode voltar) | `src/lib/agent/orchestrator/tool-policy.ts` (`case "reveal"`) |
| Instruir o agent, no prompt, a **re-buscar (`search_groups`) ao trocar de faixa de valor** em vez de re-simular um id que não existe; e a **nunca fabricar groupId** — só usar o id literal devolvido pela descoberta | `src/lib/agent/system-prompt.ts` (seção de descoberta/simulação) |
| Garantir que a mensagem de erro do adapter ("refaça a busca antes de simular") seja acionável: o agent agora TEM `search_groups` na fase pra obedecê-la | (validado pelo cassette) |

⚠️ **Não regredir o BUG-REVEAL-LOOP** — ler `docs/test-plans/2026-06-02-jornada-bevi-reveal-loop.md`
antes. O guard tem que permitir re-busca por **mudança de valor**, e continuar
bloqueando re-reveal repetido da MESMA faixa (que era o loop original). Onde
guardar o "último valor descoberto": provável `meta` da conversation (mesma fonte
do `phaseFromMeta`) — investigar `ConversationMetadata`.

## 5. Regressão exigida (3 camadas — OBRIGATÓRIO)

- **Camada 1 (structural)** — `src/lib/agent/orchestrator/tool-policy.test.ts`:
  assert que, na fase `reveal` com valor-alvo DIFERENTE do último descoberto,
  `allowedTools(meta)` **contém `search_groups`**; e que com o MESMO valor
  (sem troca) `search_groups` permanece **fora** (anti-regressão do BUG-REVEAL-LOOP).
- **Camada 2 (cassette)** — `tests/regression/agent-trajectory.test.ts`: novo
  `describe` reproduzindo a troca de faixa (256k→130k) pós-reveal. O cassette
  (MockLanguageModelV2 + simulateReadableStream) dispara o detector de **id
  fabricado** (`/auto-\d+k-\d+m/` ou groupId fora do conjunto descoberto) e
  assert estrutural de que, após trocar o valor, o agent chama `search_groups`
  ANTES de `simulate_quota`.
- **Camada 3** — não precisa adicionar manualmente (nightly cobre drift).

TDD strict: escrever Camadas 1+2, **ver as duas FALHAREM** com a assinatura do bug,
só então aplicar o fix em `tool-policy.ts`/`system-prompt.ts`, re-rodar e ver verde.
