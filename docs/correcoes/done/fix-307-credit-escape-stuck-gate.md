---
id: FIX-307
titulo: "Escape do gate credit quando travado com valor já mencionado (creditMentionedAtDesire)"
status: todo
bloco: bloco-r10-4-credit-deadlock
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/qualify-state.ts]
rodada: 2026-07-13 (loop-de-goal r10, onda 4, bloco r10-4-credit-deadlock — mesmo bloco do FIX-306, defesa em profundidade)
---
## Palavras do operador
> Mesma investigação do FIX-306 — segunda camada de defesa, pro caso do FIX-306 (promoção no
> turno certo) não cobrir 100% dos casos (ex.: o usuário nunca mais menciona nada de credit depois).

## Cenário exato
- Mesmo cenário do FIX-306, mas como rede de segurança: mesmo que a promoção pontual falhe, o
  gate `credit` não pode travar pra sempre quando já existe um valor mencionado.

## Esperado × Atual
- **Esperado:** gate com escape após N tentativas — igual ao padrão já usado nos outros gates
  pós-reveal (`timeframe`/`lance`/`lance-value`/`lance-embutido`, FIX-305 da onda 3).
- **Atual:** `credit` foi DELIBERADAMENTE excluído do `STUCK_ESCAPE_GATES`
  (`qualify-state.ts:59-64`), com o comentário "não fabricar dado financeiro" — mas quando existe
  `creditMentionedAtDesire`, usar esse valor NÃO é fabricar, é usar o que o usuário já disse.

## Root cause (INVESTIGADO)
- `qualify-state.ts:59-64`: `credit` fora do set de gates com escape por design — correto quando
  não há NENHUM valor mencionado (evita fabricar), mas incorreto quando `creditMentionedAtDesire`
  existe (o dado já foi dito, só não promovido).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Escape CONDICIONAL: se `credit` travou ≥N turnos (mesmo N do FIX-305, 3 tentativas) E `qualifyAnswers.creditMentionedAtDesire` existe → promove esse valor pra `creditMax` (mesmo mecanismo `gateStuckTurns`/default do FIX-305) | `qualify-state.ts` (região `STUCK_ESCAPE_GATES`/`gateStuckTurns`) |
| SEM esse valor mencionado, `credit` continua SEM escape (preserva o comportamento correto de "nunca fabricar dado financeiro do zero") | mesma região |

## Regressão exigida
- Teste: gate credit travado 3x COM `creditMentionedAtDesire` presente → promove o valor e segue.
- Teste: gate credit travado 3x SEM nenhum valor mencionado → continua travado (não fabrica).
- Teste de regressão do FIX-305 (outros gates com escape) continua verde.
