---
id: FIX-53
titulo: "Ordem do funil: pedir os dados (CPF/celular) ANTES do valor; e parar de repetir o pedido de valor já respondido"
status: done
bloco: bloco-a-funil-coleta-ordem
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
  - docs/jornada/jornada-canonica.md
  - docs/jornada/CONTEXT.md
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-19 — jornada2_revisão.docx (teste manual Bernardo em ajaagora.com.br)
commit: 2138f1b1
executado_em: 2026-06-26
---

# FIX-53 — Dados antes do valor + não repetir o pedido de valor

## Palavras do operador (docx)
> "- Precisa pedir os dados, antes do valor"
> "- Voltou a pedir o valor"

## Cenário exato
- **Ordem errada:** o agente apresenta o seletor de valor (`present_value_picker`) e/ou pergunta "qual valor aproximado você pensa em dar de lance" ANTES de coletar CPF/celular. O esperado (pedido do stakeholder + exigência da Bevi de CPF antecipado para simular — Trilho B self-contract) é coletar os dados pessoais ANTES de pedir/mostrar o valor.
- **Repetição:** depois de já ter recebido/registrado o valor, o agente volta a perguntar o valor ("E qual valor aproximado…" reaparece — visível na image4 duas vezes seguidas).

## Root cause investigado (Explores)
- `src/lib/agent/qualify-state.ts:60-64` — define a ordem dos gates; gate `identify` (CPF+celular+LGPD) existe, mas o fluxo permite `present_value_picker` antes do `identify`.
- `src/lib/agent/system-prompt.ts:12-21` — "Fluxo de Vendas" lista "Apresente o seletor interativo" (valor) no passo 2 sem fixar que a **identidade vem antes da busca/valor**. O prompt não reflete a regra de CPF antecipado.
- `src/lib/agent/system-prompt.ts:334-352` — regra anti-duplicação de `present_value_picker` está escrita como **promessa ao LLM** ("NÃO chame de novo"), sem dizer que o servidor bloqueia via `revealCompleted`. LLM em conversa longa re-pergunta o valor.
- `src/lib/agent/orchestrator/artifact-guard.ts:107-124` — o guard `revealCompleted`/`isRereveal` JÁ suprime re-reveals de alguns artifacts, mas o caso "voltou a pedir o valor em TEXTO" não está coberto/explicado no prompt.

## Correção proposta
| O quê | Onde |
|---|---|
| Reordenar o funil: gate `identify` (CPF+celular+LGPD) ANTES de `present_value_picker`/pergunta de valor. | `qualify-state.ts` (ordem dos gates) + `system-prompt.ts` (sequência fixa do passo 2) |
| Fixar no prompt a sequência canônica do passo 2 como regra dura, alinhada ao docx e ao CPF antecipado da Bevi. | `system-prompt.ts` |
| Anti-repetição do valor: reforçar a regra E garantir cobertura no `artifact-guard` (valor já coletado → confirmar em 1 frase e seguir, nunca re-perguntar/re-mostrar o picker). Explicar no prompt que o servidor reforça (enforcement), não só a "boa vontade" do LLM. | `system-prompt.ts` + `artifact-guard.ts` |
| **Atualizar a jornada canônica** para refletir a nova ordem (dados antes do valor) — divergência docx×código é defeito do código, mas aqui o stakeholder MUDOU a ordem na revisão; registre a mudança. | `docs/jornada/jornada-canonica.md` + `CONTEXT.md` |

> ⚠️ Nota de produto: "dados antes do valor" é mudança de ordem pedida pelo stakeholder na revisão. Como toca a jornada canônica (que é REGRA), o executor DEVE atualizar `jornada-canonica.md`/`CONTEXT.md` junto com o código e registrar a decisão em `docs/correcoes/decisions/`.

## Regressão exigida (3 camadas)
- **Camada 1:** assert na ordem dos gates (`qualify-state.ts`): `identify` precede `present_value`/value-picker; assert no prompt da sequência fixa do passo 2. `src/lib/agent/*.fix53.test.ts`.
- **Camada 2:** cassette em `agent-trajectory.test.ts` — (i) agente NÃO chama `present_value_picker` antes de coletar identidade; (ii) após valor coletado, num turno seguinte o agente NÃO re-pergunta o valor nem re-dispara o picker.
- **Camada 3:** cenário canônico de qualificação — assert estrutural da ordem.
