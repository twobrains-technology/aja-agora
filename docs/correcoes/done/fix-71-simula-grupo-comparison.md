---
id: FIX-71
titulo: "Simular grupo escolhido da comparison_table fabrica groupId e falha"
status: done
commit: 9334d21939ae00f0aede284d9cf0c36515c53ed0
executado_em: 2026-06-24
bloco: bloco-f-simula-grupo-comparison
arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/system-prompt.ts
  - src/components/chat/artifacts/comparison-table.tsx
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-23 — smoke ao vivo da jornada pós-onda 2 (develop 0460c42a)
---

## 1. Palavras do operador (Kairo)

> "lanca a correcao desse bug novo que voce encontrou"

(bug achado no smoke ao vivo conduzido pelo Claude como o cliente)

## 2. Cenário exato (reproduzível ao vivo)

1. Jornada normal até reveal (auto, CPF coletado, descoberta REAL na Bevi).
2. Trocar de faixa via texto ("quero ver 180 mil") → agent re-busca e mostra
   `comparison_table` com 3 grupos (BANCO DO BRASIL / ITAÚ / RODOBENS, ~R$ 200k).
   ✅ — isto é o FIX-68 já mergeado, funcionando.
3. Usuário **escolhe um grupo**: "Gostei do Banco do Brasil, quero seguir com ele".
4. ❌ Agent: *"Esse grupo deu um problema agora — mas tenho as outras opções da
   busca disponíveis. Quer que eu simule a segunda melhor opção?"* — a simulação do
   grupo ESCOLHIDO não acontece.

Positivo a preservar: o agent **degradou gracioso** (ofereceu 2ª opção), NÃO entrou
no loop infinito de "instabilidade" do bug original da Maria.

## 3. Root cause INVESTIGADO (provado no log do servidor)

```
{"level":"error","source":"discovery","tool":"simulate_quota",
 "conversation_id":"3265b29f-...","error_name":"Error",
 "error_message":"Oferta/grupo \"bb-auto-200k-72m\" não encontrado na descoberta atual."}
```

O agent **fabricou o groupId `bb-auto-200k-72m`** (padrão `banco-categoria-valor-prazo`)
em vez de usar o `quotaId` real (hex de 24 chars, ex. `6a0ca9ca...`) do grupo listado.
É o MESMO root cause do FIX-68 (LLM fabrica id), mas no caminho de **seleção de grupo**
— que o FIX-68 não cobriu (ele tratou re-busca por mudança de valor via `search_groups`).

Hipótese forte a confirmar no código: os payloads de `present_comparison_table` /
`present_recommendation_card` **não carregam o `quotaId` opaco** de cada linha de forma
que o agent copie literal ao escolher — então o agent não tem o id real à mão e fabrica.
Conferir o que `comparison-table.tsx` e os schemas das tools em `ai-sdk.ts` expõem.

## 4. Correção proposta

| O quê | Onde |
|---|---|
| Garantir que cada linha/card carregue o `quotaId` REAL e que o caminho de "escolher grupo X" resolva pelo id literal daquele grupo (idealmente mapeado server-side: escolha→quotaId, sem depender da LLM copiar hex) | `src/lib/agent/tools/ai-sdk.ts` (schemas/execute dos present_* e simulate_quota), `src/components/chat/artifacts/comparison-table.tsx` |
| Reforço no prompt: ao simular um grupo já apresentado (recommendation/comparison), usar o `id` LITERAL daquele grupo — NUNCA derivar/fabricar `banco-categoria-valor-prazo` | `src/lib/agent/system-prompt.ts` |
| Preservar a degradação graciosa (não regredir pro loop) — se mesmo assim o id não existir, re-buscar (`search_groups`) ou oferecer alternativa, nunca travar | validar via cassette |

## 5. Regressão exigida (3 camadas — OBRIGATÓRIO)

- **Camada 1 (structural):** assert que o payload de `present_comparison_table` /
  `present_recommendation_card` inclui o `quotaId` real por grupo (não um slug derivado).
- **Camada 2 (cassette):** `tests/regression/agent-trajectory.test.ts` — novo `describe`
  reproduzindo "usuário escolhe grupo da comparison → agent chama `simulate_quota`": o
  detector pega o id fabricado (`/\w+-auto-\d+k-\d+m/` ou groupId fora do conjunto
  descoberto) e o assert exige que o agent use um quotaId real (hex) do conjunto.
- **Camada 3:** nightly cobre; não adicionar manual.

TDD strict: escrever Camadas 1+2, ver FALHAR com a assinatura (`bb-auto-200k-72m`), só
então corrigir, re-rodar e ver verde. Gate verde do projeto = `pnpm test:unit`
(tsc global tem 25 erros pré-existentes em testes — NÃO é o gate).

## 6. Execução (2026-06-24, commit 9334d21)

Hipótese confirmada no código: o `id` dos cards (`groupCardSchema`,
`recommendationSchema` em `ai-sdk.ts`) JÁ é o `quotaId` real opaco
(`beviOfferToGroupSummary.id = offer.quotaId`), e o **clique** no card já é robusto
— `comparison-table.tsx` envia `select-group` com `group.id` real, que vira
`buildGroupSelectedDirective(... groupId ...)` com o id literal. O bug é **só no
caminho de TEXTO** ("Gostei do Banco do Brasil"), onde o agent recupera o grupo do
histórico e fabrica o slug em vez de copiar o hash.

Fix em 3 frentes (preserva a degradação graciosa — sem loop de "instabilidade"):

- **Prompt** (`system-prompt.ts`): regra dura na seção "menciona um grupo pelo
  nome" mandando usar o `id` LITERAL do grupo escolhido (que já está no histórico) e
  proibindo derivar/fabricar `banco-categoria-valor-prazo`; cita o contra-exemplo
  real `bb-auto-200k-72m` (espelha o FIX-68 que cita `auto-130k-60m`). Fallback
  acionável: re-buscar com `search_groups` OU perguntar qual grupo — nunca travar.
- **Schema** (`ai-sdk.ts`): `.describe()` do campo `id` em `groupCardSchema` e
  `recommendationSchema` agora manda copiar EXATAMENTE o id opaco de
  search/recommend e proíbe derivar slug. Schemas exportados pra Camada 1.
- **Server-side** (`ai-sdk.ts`): `looksLikeFabricatedGroupId` (detector do padrão
  `…-NNNk-NNm`) curto-circuita o id fabricado em `executeSimulateQuota`, devolvendo
  guidance acionável (usar id literal / re-buscar) em vez de gastar round-trip na
  Bevi e o erro virar "instabilidade" genérica. Zero risco de simular grupo errado
  (sem fuzzy match — só detecta e orienta).

**Decisão consciente:** NÃO foi adicionada resolução fuzzy server-side
(slug→quotaId por aproximação de banco/valor), porque em fintech simular o grupo
ERRADO é pior que degradar. O caminho de clique já resolve server-side com o id
real; o caminho de texto é coberto por prompt + schema + detector + degradação.

**3 camadas verdes:** Camada 1 — `system-prompt.fix-71.test.ts` (4) +
`ai-sdk.fix-71.test.ts` (4, schema + detector); Camada 2 — cassette FIX-71 em
`agent-trajectory.test.ts` (4: stream do bug `bb-auto-200k-72m`, trajetória correta
com id real do conjunto apresentado, acoplamento prompt + detector). Camada 3:
nightly cobre. Gate `pnpm test:unit`: **1903 passed / 0 failed** (container
transitório com store pnpm compartilhado + Postgres migrado).
