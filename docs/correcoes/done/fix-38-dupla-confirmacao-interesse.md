---
id: FIX-38
titulo: "'Tenho interesse' → card 'Esse plano faz sentido?' → 'Sim, quero contratar' → identify: dupla confirmação por construção — fricção inútil no avanço explícito"
status: done
bloco: bloco-t-ux-chat
decisao_resolvida: "Validado contra docs/jornada/jornada-canonica.md (passos 4-5): pular o decision_prompt no sinal EXPLÍCITO não viola o passo 4→5 — o card de decisão é instrumento pra DEFINIR, não pedágio após a definição já dada no clique. Ver seção Decisão."
arquivos:
  - src/app/api/chat/route.ts (handler kind "interest" — avanço direto)
  - src/app/api/chat/route.lead-form-prefill.test.ts (Camada 1)
  - tests/regression/agent-trajectory.test.ts (Camada 2 — cassette FIX-38 + FIX-34 ajustado)
  - tests/eval/agent-flow.eval.test.ts (Camada 3 — EVAL-FIX-38)
rodada: 2026-06-12 (testes manuais do Kairo no dev, pós-merge PRs #28/#30)
anotado_em: 2026-06-12
executado_em: 2026-06-12
commit: a1b8007
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

### Decisão (validação contra a jornada canônica — execução 2026-06-12)

Li `docs/jornada/jornada-canonica.md`, passos 4 e 5, antes de codar:

- **Passo 4 ("Avaliar, simular e definir com o cliente")** lista o **card de
  decisão** "Esse plano faz sentido para você?" (3 opções fixas) como o
  ARTEFATO QUE FECHA a etapa de avaliação. Ele é instrumento pra o cliente
  **definir** — não um pedágio obrigatório DEPOIS de a definição já existir.
- O clique explícito **"Tenho interesse"** no plano em tela JÁ é a definição:
  equivale, em intenção, ao botão **"Sim, quero contratar agora"** do próprio
  card de decisão. Exigir que quem clicou "Tenho interesse" depois clique
  "Sim, quero contratar agora" é repetir a mesma pergunta — a dupla
  confirmação que o operador apontou como "inútil".
- **Conclusão (não viola passo 4→5):** pular o `decision_prompt` no sinal
  EXPLÍCITO não viola a jornada — a transição avaliação→contratação acontece
  (vai pro passo 5, `present_contract_form`); o que some é o SEGUNDO gate
  redundante. O **card de decisão permanece** para os caminhos AMBÍGUOS:
  satisfação difusa pós-reveal em texto ("gostei", "faz sentido") sem clique,
  e a recusa do simulador (gate `simulator-offer` = "Agora não") — onde o card
  agrega de fato (estrutura as 3 saídas pra quem ainda não decidiu).
- **Invariante FIX-34 preservado:** interest → contratação self-service
  (`buildAdvanceToContractDirective` → `present_contract_form`), NUNCA captura
  de lead nem promessa de consultor humano. Cassettes mantêm esse detector.
