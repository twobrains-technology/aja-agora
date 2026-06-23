---
id: FIX-70
titulo: "Sweep sequencial multi-faixa na descoberta (varre 3-5 faixas, acumula no offerIndex)"
status: todo
bloco: bloco-e-sweep-multifaixa
arquivos:
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/adapters/bevi/self-contract-client.ts
  - src/lib/adapters/bevi/bevi-self-contract-adapter.test.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/discovery-count.ts
rodada: 2026-06-22 — investigação dos logs do agent na develop
---

## 1. Palavras do operador (Kairo)

> "será que conseguimos buscar mais faixas ou mais opções fazendo mais buscas na
> bevi em uma espécie de batch? para melhorar a nossa lógica de recomendação?"

E na decisão de escopo: *"tudo que precisar para resolver todos os pontos que
dissemos, o que ficar mais produtivo."*

## 2. Cenário / motivação

Hoje a descoberta busca **uma faixa de valor só** (`simulate(value)` → offers da
Bevi). Resultado: o `recommendation_card` mostra 1 grupo e, quando o usuário quer
ver alternativas, não há material no índice. No cookbook §6, uma busca já traz
várias ofertas (AUTOS 30k → 7), mas tudo de UMA faixa. Varrendo 3-5 faixas ao redor
do alvo, a recomendação ganha um espectro real pra comparar custo-parcela e montar
uma `comparison_table` de verdade.

## 3. Root cause / viabilidade INVESTIGADA (provado no código + cookbook)

- A infra do adapter **já é cumulativa**: `ensureOffers(segment, value)` cacheia por
  `${segment}:${value}` (`offerCache`) e **acumula tudo no `offerIndex`** por quotaId
  (`bevi-self-contract-adapter.ts:145-176`). O adapter **persiste por conversa** num
  LRU em memória (`src/lib/adapters/index.ts:38` `getDiscoveryAdapter` → `_discoveryCache`,
  max 500). Logo: um sweep popula um índice que **sobrevive a conversa inteira** →
  "tem outra?" e troca de faixa viram lookup instantâneo, sem nova chamada Bevi.
- Batch **paralelo é impossível** (`bevi-api-requests.md §3`: 1 proposta ativa por
  device). Só **sequencial** (re-PATCH do step `simulation`).
- Padrão sequencial provado no `§6` do cookbook.
- **Piso de crédito** (`§5a`): valor abaixo do piso → 200 com `offers: []` (vazio,
  não-erro) → não varrer no vácuo.

## 4. Correção proposta

| O quê | Onde |
|---|---|
| `sweepOffers(segment, values[])` no adapter: itera SEQUENCIAL (gap configurável ~400ms, reusa o retry/`SIM_RETRY` já existente), pula faixa que volta vazia (piso), acumula no `offerIndex`. Reusa `ensureOffers` (que já cacheia/indexa). Defensivo a rate-limit: para o sweep e segue com o que já tem se a Bevi começar a 429/erro (circuit breaker simples) | `bevi-self-contract-adapter.ts` (+ `self-contract-client.ts` se precisar expor erro de throttle) |
| Política de faixas derivadas do alvo (NÃO o range inteiro): ex. `[alvo×0.7, alvo, alvo×1.3]` + faixas redondas vizinhas — 3-5 pontos. Parametrizável; defaults conservadores informados pelo spike (FIX-69) | `bevi-self-contract-adapter.ts` / helper |
| Orquestração HÍBRIDA: a 1ª oferta (faixa-alvo) sai rápido (UX < 3s); o sweep das vizinhas enriquece o índice/`comparison_table`. Decidir a mecânica (mesmo turno após a 1ª oferta, ou directive/segundo turno) — brainstorme | `src/lib/agent/tools/ai-sdk.ts` (search_groups/nova tool), `discovery-count.ts` |
| Estado da proposta: cada `simulate` sobrescreve o "valor que o cliente quer" — garantir que, antes do fechamento (passo 5), o valor ESCOLHIDO seja re-simulado. Anotar/implementar o cuidado | adapter / fluxo de fechamento |

**Limites de escopo (inviolável):**
- **NÃO tocar `src/lib/agent/recommendation.ts`** — é do bloco-b parado (FIX-56). O
  sweep só ENRIQUECE o índice que a recomendação consome; não muda `rankGroups`.
- **NÃO tocar `tool-policy.ts`** (bloco-d).
- **Cache por processo** é caveat de escala (prod multi-réplica: turno noutra réplica
  = índice vazio). Para o piloto (1 container) está ok — **anotar no `.done/`**, não
  bloquear.

## 5. DESIGN (brainstorming autônomo — passo 2 do prompt)

Feature nova com decisões reais de design (mecânica do híbrido, política de faixas,
circuit breaker). Use o raciocínio da skill `superpowers:brainstorming` mas DECIDA
sozinho (você é o decisor; não trave esperando aprovação). Registre cada decisão em
`docs/correcoes/decisions/<data>-bloco-e-sweep-multifaixa.md` (o quê · opções · escolhida + porquê).

## 6. Regressão exigida

- **Camada 1 (structural)** — `bevi-self-contract-adapter.test.ts`: `sweepOffers`
  com client fake (fixtures = capturas reais) acumula ofertas de N faixas no
  `offerIndex`; faixa vazia (piso) é pulada sem quebrar; circuit breaker para em
  erro de throttle simulado.
- **Camada 2 (cassette)** — adicionar SÓ se o sweep mudar comportamento OBSERVÁVEL
  do agent (ex. nova tool no stream). Se a mudança for puramente backend (adapter
  enriquece índice, agent chama as mesmas tools), integration/adapter test basta —
  documentar a escolha. Se adicionar cassette em `agent-trajectory.test.ts`, é
  append-only (nível 2 com bloco-d) → mergear DEPOIS de D.
- Integration test do fluxo de descoberta multi-faixa contra fixtures reais.

TDD: teste falha antes da implementação de cada unidade.
