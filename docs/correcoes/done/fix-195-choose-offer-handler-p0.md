---
id: FIX-195
titulo: "Handler server-side de choose_offer (raiz do P0): avança ao contrato com groupId, sem re-busca"
status: done
commit: 1c47bf56
executado_em: 2026-07-02
bloco: bloco-a-reveal-dados
arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/other-options.ts
  - tests/regression/agent-trajectory.test.ts
rodada: "2026-07-01 · onda reveal-refino · qa-dono-produto (carro web, conv fe2e8a09) + refino spec"
---

## Palavras do operador
P0 da rodada: ao dizer "quero seguir com o BB", o agente "deu um problema, preciso trazer os IDs reais" e entrou em loop.

## Cenário exato (P0 — ALTA)
Reveal do carro → usuário digita "Gostei do Banco do Brasil, quero seguir". Esperado: avanço limpo ao contrato. Atual: 3 turnos de meta-narrativa admitindo falha técnica ("esse grupo deu um problema", "tive um problema ao acessar os grupos", "preciso trazer os IDs reais") + o value_picker selado → **loop**; só saiu com confirmação manual. Evidência: `docs/correcoes/inbox/_evidencia/passo5-6-META-NARRATIVA-loop.png`. Casa com o padrão proibido §8 do roteiro.

## Root cause investigado (spec §2 + adendo B8)
Como o hero não é coagido/ancorado (FIX-191), a escolha por texto livre faz o agente tentar **re-resolver** o grupo/ID e falhar → meta-narrativa. Não existe caminho estruturado de "escolher esta cota" que carregue o `groupId` real ao contrato.

## Correção proposta (CONTRATO com bloco-b)
| O quê | Onde |
|---|---|
| Handler server-side de `{kind:"choose_offer", groupId, ofertaId?}` → avança direto a `contract_form`/`real_offer` re-simulando com esse `groupId`, SEM `search_groups`/re-resolução | `runner.ts`/orchestrator |
| Garantir que escolher cota NÃO dispara nova busca nem gera meta-narrativa | `runner.ts`/`directives.ts` |
| (bloco-b emite a ação a partir do seletor — ver contrato) | — |

## Regressão exigida (3 camadas — comportamento de agent)
- Camada 1: dado `choose_offer` com groupId, o fluxo avança ao contrato e NÃO chama `search_groups`.
- Camada 2: **cassette** — usuário escolhe cota (BB) → segue → chega ao contrato **sem** `search_groups` e **sem** frase `/(deu|tive) um problema|vou (buscar|usar a ferramenta)|IDs? reais/i` (cenário do P0). É o cassette que trava o retorno do bug.
