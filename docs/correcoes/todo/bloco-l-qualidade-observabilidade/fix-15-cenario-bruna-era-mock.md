---
id: FIX-15
titulo: "Cenário de eval 'Bruna/Monique (imóvel)' é da era mock — falha em cascata sem fixture de IMOVEL e espera artifacts mortos"
status: todo
bloco: bloco-l-qualidade-observabilidade
arquivos:
  - tests/eval/agent-flow.eval.test.ts
  - tests/helpers/fixture-discovery-adapter.ts
  - src/lib/adapters/bevi/__fixtures__/ (fixture nova de IMOVEL)
rodada: 2026-06-05 noite (run do eval completo pós-merge dos blocos A/B/C)
---

# FIX-15 — Cenário de eval "Bruna/Monique (imóvel)" é da era mock

## Sintoma (run de 2026-06-05 ~22h30)

`npm run test:eval`: **7 failed | 51 passed | 1 skipped** — TODAS as falhas no
describe "Eval flow Bruna — Cenário 1: Primeira vez Imóvel (Monique)" de
`agent-flow.eval.test.ts`. Jornada canônica (29 asserts), assistant-flow e o teste
de contrato do shape Bevi: **verdes**.

## Root cause (investigado, não é regressão de produto)

1. **Fixture de descoberta só tem AUTOS**: `ok-selfcontract-simulation.json` = 3
   ofertas AUTOS, cartas R$ 42.000–54.832. O cenário pede IMÓVEL ~R$ 400.000 →
   `search_groups` retorna 0 grupos, 4 tentativas, agente honesto oferece humano
   ("instabilidade na busca"), user-bot aceita → `suggest_handoff` → fluxo pausa →
   7 assertions em cascata (lance-embutido, value_picker, optin, B6, B9, lead).
   Transcript: `[handoff] persona=imovel reason="Usuária preferiu falar com
   consultor humano após instabilidade na busca." — pausing flow`.
2. **Asserts da era mock**: B6 espera `comparison_table`/`group_cards >= 3` — o
   fluxo canônico pós-mock emite `recommendation_card` + `simulation_result`
   (outro cenário do MESMO arquivo asserta `not.toContain("comparison_table")`).
   `lead_form`/`save_contact_whatsapp` também mudaram com D1/optin por estágio.
3. O cenário não roda verde desde a migração mock→Bevi (a cota Anthropic caiu
   antes do primeiro nightly pós-migração — nunca foi visto falhando).

## Correção proposta

| # | O quê | Onde |
|---|---|---|
| A | Capturar fixture REAL de IMOVEL na Bevi (sweep §6 do bevi-api-requests já mapeou: IMOVEL 50k → 3 ofertas RODOBENS/ÂNCORA; capturar também faixa ~200k) e permitir ao `fixtureDiscoveryAdapter` servir por segmento | `__fixtures__/` + `tests/helpers/fixture-discovery-adapter.ts` |
| B | Reescrever os asserts do cenário Bruna pro contrato canônico: `recommendation_card`/`simulation_result` no reveal, gates D1 (identify antes da busca), optin WhatsApp por estágio | `tests/eval/agent-flow.eval.test.ts` |
| C | Ajustar o perfil da Monique pra um valor coberto pela fixture nova (ou manter 400k SE a captura cobrir) | idem |

## Regressão exigida

- O próprio cenário re-escrito é a regressão (Camada 3). Garantir que o run
  completo `npm run test:eval` fica 100% verde (sem skip silencioso do cenário).
- Camada 1: assert estrutural de que a fixture de IMOVEL existe e tem >=3 ofertas
  (proteção contra fixture órfã).
