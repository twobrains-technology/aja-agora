---
id: FIX-170
titulo: "Transbordo auto: cobertura BEHAVIORAL de isolamento de falha (verde frágil → mutation-verified)"
status: done
executado_em: 2026-07-01
severidade: media
projeto: aja-agora
rodada: 2026-07-01 — QA autônomo Frente 3 (mesa de operação), ancorado na onda divergencias-jornada (develop 4c8a81c5)
arquivos: [src/lib/workers/proposal-status-poll.fail-isolation.integration.test.ts]
tipo: test-hardening
mexe_em: [src/lib/workers/proposal-status-poll.ts, src/lib/mesa/dispatch.ts]
---

## Origem
QA autônomo da mesa. O card **FIX-123** (§Regressão, caso 4) exigia um teste behavioral de
**isolamento de falha**: "com o broadcast/outbound falhando (mock rejeita), a transição de
raia e o ciclo SEGUEM (raia aplicada, ciclo não lança) — best-effort". A onda entregou só a
asserção **STRUCTURAL** (`proposal-status-poll.transbordo.test.ts:27` — grep de
`/try\s*{[\s\S]*dispatchAutoTransbordo[\s\S]*catch/` no source). Nunca provou o comportamento.

Isso é o "verde frágil" que o depth gate condena: a rede de regressão tinha buraco no
invariante mais importante do auto-transbordo (o canal externo NÃO pode derrubar a máquina de
raia nem o ciclo de polling).

## Cenário exato
- **Onde:** `reconcileProposalStage` (worker) → `dispatchAutoTransbordo` → `broadcastCaseToAttendants`.
- **O que não estava provado:** que uma exceção do broadcast/dispatch é engolida e que a raia
  (aplicada ANTES do dispatch) + o handoff (registrado ANTES do broadcast) sobrevivem.

## Esperado × Atual (do TESTE, não do produto)
- **Produto:** CORRETO — `dispatch.ts:37-52` envolve o broadcast em try/catch e `proposal-status-poll.ts:70-82`
  envolve o dispatch em try/catch. Confirmado lendo o código.
- **Teste (era):** só structural (grep). **Agora:** behavioral com DB real e a borda quebrada.

## Correção (o quê × onde)
| O quê | Onde |
|-------|------|
| Teste behavioral: (1) `broadcastCaseToAttendants` rejeita → handoff registrado + raia aplicada + reconcile não lança; (2) `dispatchAutoTransbordo` rejeita → raia persiste + ciclo não derruba (worker try/catch) | `src/lib/workers/proposal-status-poll.fail-isolation.integration.test.ts` (novo) |

## Verificação de DENTES (mutation)
Removi o try/catch do worker (`await dispatchAutoTransbordo(row.leadId)` sem proteção) →
teste #2 ficou **VERMELHO** (exceção propagou). Revertido → **VERDE**. O teste pega a regressão.

## Regressão
Código não-agêntico (worker + DB, sem LLM) → integration, sem cassette. Cross-ref FIX-123.
Roda no perfil integration (skip se `DATABASE_URL` ausente/sentinel). 2/2 verdes no container.
