---
id: FIX-437
titulo: "A retomada não cobra gate de coleta com o desbloqueio do telefone pendente"
status: done
bloco: retomada-nao-cobra-gate-com-desbloqueio
commit: bf6b510b
arquivos:
  - src/lib/agent/gate-reengage.ts
  - src/lib/agent/gate-reengage.test.ts
  - src/lib/agent/langgraph/nodes/persist.ts
  - src/lib/agent/qualify-state.o-nome-nao-e-porta-fechada.test.ts
  - src/lib/workers/gate-reengage-poll.ts
  - src/lib/workers/gate-reengage-poll.desbloqueio.integration.test.ts
  - src/lib/workers/gate-reengage-poll.integration.test.ts
rodada: 2026-10-02
executado_em: 2026-10-02
---
## O defeito medido
As "perguntas repetidas 3×" de 30/09 (`576e5b66` 12:16–12:22, `ef18fd09` 14:45–14:51) são o watchdog
`gate-reengage`, com o cliente parado no **card do telefone**. Ele cobrava o gate `credit` ("valor do bem")
com a escada fixa, mas o bloqueio real era o telefone — `pendingGateAfterTurn` não conhecia o desbloqueio.

## O que mudou (D8)
1. `pendingGateAfterTurn` ganha o parâmetro obrigatório `desbloqueioPendente: boolean`. Com `true`, um gate de
   **coleta** (`credit`, `lance`, `lance-value`, `lance-embutido`, `identify`, `name`) não é armado
   (`null`). Gates de outra natureza (ex.: `timeframe`) seguem iguais — D8 é cirúrgico, não um "bloqueia
   tudo".
2. O nó `persist` lê `leituraDoDesbloqueio(conversationId)` (só na web; só quando mudaria a decisão —
   `isUserTurn && conduziu === false`) e passa o estado. Best-effort: falha na leitura ⇒ `false` (o watchdog
   cobra como antes; o teste A/B nunca derruba a venda).
3. O worker `gate-reengage-poll` **reconfere** o desbloqueio no disparo, não só na marcação: para web com o
   card ainda pendente, **consome o marcador sem enviar nada**. O caminho WhatsApp não foi tocado.

O lembrete do telefone **não** ganhou texto novo (copy é do dono: `PENDENTE-KAIRO`).

## Provado
- Unit `gate-reengage.test.ts`: com desbloqueio pendente, `credit` → `null`; sem, → `credit`; `timeframe`
  segue armado; 2 cenários ponta-a-ponta provam a fiação do `persist` (web sem telefone não arma; WhatsApp
  arma como sempre).
- Integração `gate-reengage-poll.desbloqueio.integration.test.ts` (reproduz `576e5b66`): web braço A sem lead
  com `pendingGate=credit` vencido ⇒ `reengaged: 0`, nenhuma mensagem do assistente, marcador consumido.
  Controle: com lead/telefone ⇒ cobra (1 mensagem, tentativa 1); WhatsApp não regride.
- `pnpm -s vitest run src/lib/agent/gate-reengage src/lib/workers/gate-reengage-poll src/lib/agent/langgraph/nodes/persist`
  → **5 arquivos / 26 testes verdes**; `typecheck` exit 0.
- Escopo ampliado em 2 arquivos de teste (justificado): `gate-reengage-poll.integration.test.ts` (a fixture
  web passou a semear telefone) e `qualify-state.o-nome-nao-e-porta-fechada.test.ts` (parâmetro novo
  obrigatório).