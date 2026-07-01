---
id: FIX-117
titulo: "WhatsApp: \"Tenho interesse\" pós-reveal = avanço direto ao contract (paridade FIX-38)"
status: todo
severidade: alta
bloco: bloco-whatsapp-funil-paridade
arquivos: [src/lib/whatsapp/interactive-handlers.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---

## Origem (auditoria D18 — voz do operador na jornada canônica)

Divergência **D18** do Mapa em `docs/jornada/jornada-canonica.md`, rodada de auditoria
código×jornada de 2026-07-01. A **REGRA** (a voz do operador na jornada) é:

> **Passo 5** — "Tenho interesse" pós-reveal é **AVANÇO direto ao `contract_form`** nos
> dois canais. O **FIX-38** eliminou a dupla confirmação no web ("tá pedindo confirmação
> demais" — fricção inútil pra quem já decidiu no clique). O card de decisão ("Esse plano
> faz sentido?") só aparece nos caminhos **AMBÍGUOS** (satisfação difusa em texto, ou o
> gate `simulator-offer` "Agora não"), nunca como pedágio depois da decisão já dada.

O web já obedece. O WhatsApp ficou pra trás — reproduz o comportamento **pré-FIX-38**.
A regra deste card é **paridade com o comportamento web já correto**.

## Cenário exato (comportamento divergente HOJE)

- **Canal:** WhatsApp (interativo).
- **Passos:** 1) Usuário chega ao reveal (recomendação apresentada). 2) Clica **"Tenho
  interesse"** (1ª vez). 3) Em vez de ir ao passo 5 (formulário de contratação), o agente
  **intercala o card de decisão** "Esse plano faz sentido?". 4) Só num **2º** clique de
  interesse é que ele avança pro contract.
- **Evidência (file:line):**
  - `src/lib/whatsapp/interactive-handlers.ts:580-588` — `handleInterest`: se
    `!meta.decisionDispatched` → marca `decisionDispatched` e dispara
    `buildDecisionPromptDirective` (o card de decisão), retornando ali. O 1º interesse
    **não avança**.
  - `src/lib/whatsapp/interactive-handlers.ts:590-595` — só o **2º** interesse (quando
    `decisionDispatched === true`) chama `buildAdvanceToContractDirective`.
  - **Web CORRETO** — `src/app/api/chat/route.ts:485-499`: `interest` marca
    `decisionDispatched` se ainda não estava e **sempre** dispara
    `buildAdvanceToContractDirective`, sem intercalar card (comentário FIX-29/34/**38**).

## Esperado × Atual

- **Esperado (paridade FIX-38):** o **1º** "Tenho interesse" no WhatsApp já dispara
  `buildAdvanceToContractDirective` — vai direto ao passo 5, exatamente como o web. O card
  de decisão fica **só** nos caminhos ambíguos.
- **Atual:** o 1º "Tenho interesse" no WhatsApp emite o card de decisão; o avanço ao
  contract só acontece no 2º clique — dupla confirmação que o FIX-38 já removeu no web.

## Root cause (INVESTIGADO — provado no código atual)

Confirmado lendo o código deste worktree (não é gap já resolvido por FIX-113/114/115):

- `handleInterest` (`interactive-handlers.ts:563-596`) mantém o **branch pré-FIX-38**:
  `if (!meta.decisionDispatched)` (`:580`) → `persistMeta(...decisionDispatched: true)`
  (`:581`) → `runAgentDirective(..., buildDecisionPromptDirective(...))` (`:582-586`) →
  `return true` (`:587`). Ou seja: no 1º interesse ele **sempre** cai no card de decisão.
  Só o caminho `else` (`:590-595`, `decisionDispatched === true`) chama
  `buildAdvanceToContractDirective`.
- O web (`route.ts:485-499`) foi corrigido pelo FIX-38: marca `decisionDispatched` **antes**
  (`:488-490`) — necessário pra tool-policy liberar `present_contract_form` na fase
  `closing` — e **sempre** dispara `buildAdvanceToContractDirective` (`:491-497`), sem
  intercalar o card. O WhatsApp não recebeu esse patch: ambos os builders já estão
  importados no handler (`:577-579`), mas a ordem lógica é a antiga.
- O caminho ambíguo que **deve** manter o card é outro handler — `handleSimulatorOffer`
  (`:363-...`), ramo "no"/"Agora não" (`:384-389`), que legitimamente dispara
  `buildDecisionPromptDirective`. Esse **não** é tocado por este fix.

## Correção proposta (o quê × onde)

Levar `handleInterest` do WhatsApp à **paridade com o web** — 1º interesse já avança.

| O quê | Onde |
|-------|------|
| Remover o branch `if (!meta.decisionDispatched)` que dispara `buildDecisionPromptDirective` e retorna | `src/lib/whatsapp/interactive-handlers.ts:580-588` |
| Sempre disparar `buildAdvanceToContractDirective({ administradora: meta.recommendedAdministradora })` no interesse | `src/lib/whatsapp/interactive-handlers.ts` (corpo de `handleInterest`) |
| Marcar `decisionDispatched: true` **antes** de dirigir o avanço quando ainda não estava (espelha `route.ts:488-490` — tool-policy só libera `present_contract_form` na fase `closing`) | `src/lib/whatsapp/interactive-handlers.ts` (corpo de `handleInterest`) |
| **NÃO** tocar `handleSimulatorOffer` (`:363`) — o card de decisão continua no caminho ambíguo "Agora não" | — (fora do escopo, preservar) |

Manter o `recordUserClick(ctx)` e o guard de handoff (`:566-567`) intactos. A remoção do
`import` de `buildDecisionPromptDirective` em `handleInterest` (`:577`) é bem-vinda se ele
ficar sem uso local — não deixar import órfão.

## Regressão exigida (3 camadas — bug de comportamento do agente/WhatsApp)

Por ser comportamento do funil no canal WhatsApp, seguir as **3 camadas** obrigatórias:

- **Camada 1 — Structural** (`src/lib/whatsapp/interactive-handlers.<slug>.test.ts`):
  asserção de que `handleInterest`, com `meta.decisionDispatched === false`, chama
  `buildAdvanceToContractDirective` (e **não** `buildDecisionPromptDirective`). Espelhar o
  teste equivalente do web (interest → advance) pra travar a paridade. Assertar também que
  `decisionDispatched` é persistido como `true` no avanço.
- **Camada 2 — Cassette** em `tests/regression/agent-trajectory.test.ts`: `describe` novo
  ("FIX-117 — WhatsApp interest = avanço direto") com o stream determinístico do turno de
  interesse pós-reveal, assertando que o detector do card de decisão **não** dispara e que a
  trajetória segue pro `contract_form` no 1º clique. Cross-ref pro teste structural.
- **Camada 3 — Eval** (`tests/eval/agent-flow.eval.test.ts`, nightly): cenário WhatsApp de
  persona que clica "Tenho interesse" 1× e deve chegar ao passo 5 sem re-confirmação —
  paridade com o cenário web equivalente. Só relatório, não gate.

**Fluxo TDD:** escrever Camadas 1+2, **ver falhar** (hoje o 1º interesse emite o card),
aplicar o fix em `handleInterest`, ver as duas verdes, commit `test+fix:` único.

**A REGRA é a paridade com o comportamento web já correto** (`route.ts:485-499`, FIX-38):
o WhatsApp deve avançar no 1º interesse exatamente como o web, mantendo o card só nos
caminhos ambíguos.
