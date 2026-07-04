---
id: FIX-219
titulo: "Busca Bevi com E sem lance embutido (2 queries) + união/dedup; cache key inclui o embutido"
status: todo
severidade: media
projeto: aja-agora
bloco: bloco-descoberta-busca
arquivos:
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/bevi/discovery-session.ts
  - src/lib/adapters/types.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/recommendation.ts
rodada: 2026-07-04 — Ata de alinhamento com o cliente (item 3.3, P1)
---
## Palavras do operador
> Ata 3.3: *"Na busca, consultar a Bevi duas vezes: com lance embutido e sem lance embutido (a API exige informar um valor de embutido — tratar como duas 'queries'). Limitação: o retorno NÃO traz info de lance embutido. Decisão pragmática: por ora assumir que todos podem ter embutido (~30% utilizável — confirmar o teto real). Se a cota não permitir, vende-se outra equivalente. Resolver o caso de borda depois."*

## Cenário exato
- Usuário informa o valor; o sistema deve trazer o **máximo de cartas** cobrindo grupos **com** e **sem** lance embutido.

## Esperado × Atual
- **Esperado:** a busca roda 2× (com embutido ~30% e sem embutido), une e deduplica os resultados por `quotaId`, e apresenta todas as cartas.
- **Atual:** o sweep varre **faixa de VALOR** (spread `[0.7,1,1.3]`), o embutido é **único** (vem de `prefs`), e a cache key **não inclui** o embutido (colide entre variantes).

## Root cause (INVESTIGADO)
- `bevi-self-contract-adapter.ts:234-265` `ensureOffers()` — usa `embeddedPercentage` fixo de `prefs` (`:256-260`); **cache key `${segment}:${value}` (`:234`) NÃO inclui o embutido** → se rodar com e sem, uma variante sobrescreve a outra no cache. Indexa por `quotaId` (`:263`).
- `bevi-self-contract-adapter.ts:280-340` `sweepOffers()` — sweep atual = varredura de valor; dedup por `quotaId` via `seen` Set (`:284,312-315`). `DEFAULT_SWEEP_SPREAD` (`:59`).
- `discovery-session.ts:15-23` `prefsFromMeta()` — `embeddedPercentage = q.lanceEmbutido ? (q.lanceEmbutidoPercent ?? 30) : undefined`. `undefined` = sem embutido.
- `self-contract-client.ts:314,344` — **já suporta "sem embutido"** (omite o campo quando ausente) → nenhuma mudança no client.
- `ai-sdk.ts:326-333` (`searchGroupsSweepInput`) + `types.ts:100-109` (`SearchGroupsParams.sweep`) — o sweep é opt-in; comentário `ai-sdk.ts:324` diz explicitamente que hoje é "só faixa de valor (sem objetivo×lance)" → o eixo embutido é **novo**.
- Dedup final: `recommendation.ts:158-169` (administradora::grupo) e `:236-249` (por id) — preservam modalidade (`isLanceCoherent` `:87-90`).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Incluir o embutido na **cache key** pra não colidir entre variantes | `bevi-self-contract-adapter.ts:234` → `${segment}:${value}:${embedded ?? "none"}` |
| Parametrizar `ensureOffers` pra rodar 2× (undefined=sem, ~30%=com) | `bevi-self-contract-adapter.ts:255-260` |
| Novo eixo "com/sem embutido" (análogo ao `deriveSweepValues`): unir + dedup por `quotaId` reusando o padrão do sweep | `bevi-self-contract-adapter.ts:280-340` (um `sweepEmbedded` irmão, ou combinar valor×embutido) |
| Flag/plumbing pra disparar o eixo embutido (default ligado quando há valor) | `types.ts:100-109`, `ai-sdk.ts:326-333` |
| Assumir ~30% embutido por ora (Ata) — não depender de a Bevi informar se a cota permite | `discovery-session.ts:15-23` |
| Garantir que o dedup final não colapsa indevidamente ofertas com/sem embutido do mesmo grupo (modalidade importa) | `recommendation.ts:158-169` |

⚠️ **Caso de borda (Ata): resolver depois** — se a cota escolhida não permitir embutido, vende-se equivalente. Por ora, assumir que todos podem ter (~30%). NÃO travar a experiência por isso.

## Regressão exigida (TDD strict)
1. Teste que `searchGroups` (com o eixo embutido ligado) retorna ofertas **com** e **sem** embutido, deduplicadas por `quotaId`.
2. Teste que a **cache key** distingue as variantes (com≠sem) — sem colisão/sobrescrita.
3. Teste que a busca sem `lanceEmbutido` definido (estado da 1ª busca, pós-FIX-215) continua válida (assume ~30% e/ou roda ambas).
