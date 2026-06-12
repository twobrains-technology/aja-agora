---
id: FIX-38
titulo: "'Tenho interesse' → card 'Esse plano faz sentido?' → 'Sim, quero contratar' → identify: dupla confirmação por construção — fricção inútil no avanço explícito"
status: todo
bloco: bloco-t-ux-chat
decisao_pendente: "Validar contra docs/jornada/jornada-canonica.md na execução: o decision_prompt do docx fecha a etapa de AVALIAÇÃO — confirmar que pulá-lo no sinal explícito não viola o passo 4→5"
arquivos:
  - src/app/api/chat/route.ts (handler kind "interest" ~455)
  - src/lib/agent/orchestrator/directives.ts (quando dirigir decision vs contract)
  - tests/regression/agent-trajectory.test.ts (cassette)
rodada: 2026-06-12 (testes manuais do Kairo no dev, pós-merge PRs #28/#30)
anotado_em: 2026-06-12
---

# FIX-38 — Dupla confirmação no avanço explícito ("confirmação demais")

### Palavras do operador

> "ta pedindo confirmacao demais, estou achando inutil isso"

### Cenário exato (prints, dev 2026-06-12)

1. Usuário clica **"Tenho interesse"** no card de simulação.
2. Agente: "Boa, Kairo! Então deixa eu confirmar com você:" + card
   **"Esse plano faz sentido para você? (ITAÚ)"**.
3. Usuário clica **"Sim, quero contratar agora"**.
4. Agente: "Boa! Pra fechar, só preciso de uns dados rápidos:" + identify.

Dois gates de confirmação consecutivos pra quem JÁ deu o sinal explícito no
plano que estava vendo. O interesse virou pedágio.

### Root cause INVESTIGADO (provado no código)

`route.ts:455-477` (desenho do FIX-34, mergeado hoje no PR #30): o kind
`interest` SEMPRE dispara `buildDecisionPromptDirective` na primeira vez
(`!fresh.decisionDispatched`) e só um SEGUNDO sinal de avanço dirige
`buildAdvanceToContractDirective`. O FIX-34 acertou em matar o funil de lead
legado, mas trocou por dupla confirmação por construção.

### Correção proposta

| O quê | Onde |
|---|---|
| Kind `interest` (clique explícito no plano em tela) → DIRETO `buildAdvanceToContractDirective` + marca `decisionDispatched` (idempotência preservada) | `route.ts` handler interest |
| `decision_prompt` fica pros caminhos AMBÍGUOS: satisfação difusa pós-reveal/simulador em texto ("gostei", "faz sentido") sem clique de interesse — onde o card de decisão do docx agrega (fecha a etapa de avaliação) | `directives.ts` / orquestrador |
| Cassette do FIX-34 ajustado: o invariante que importa é "interest NUNCA vira lead/consultor" — não "interest passa pelo decision" | `agent-trajectory.test.ts` |

### Regressão exigida (3 camadas — comportamento do funil)

- Camada 1: route test — kind interest com decisão pendente vai direto pro
  advance-to-contract (sem decision_prompt) e marca decisionDispatched.
- Camada 2: cassette — clique "Tenho interesse" → turno dirige contract_form
  em UM passo; texto sem nova pergunta de confirmação; invariante anti-lead
  do FIX-34 preservado.
- Camada 3: critério de eval — nº de gates entre o sinal explícito de
  interesse e o identify ≤ 1.
