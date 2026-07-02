---
bloco: bloco-funil-nao-trava
branch: fix/funil-nao-trava
workspace: fix-funil-nao-trava
onda: 1
status: PRONTO PARA LANÇAR
tipo: hotfix
elevacao: develop + prod (--allow-prod — pedido explícito do Kairo 2026-07-02)
depends_on: []
paralelo_com: []
itens: [FIX-206, FIX-207]
escopo_arquivos:
  # Estratégia 1 — auto-avanço determinístico (FIX-206)
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/whatsapp/adapter.ts
  - src/app/api/chat/route.ts
  # Estratégia 3 — watchdog de inatividade (FIX-207)
  - src/lib/agent/personas.ts            # tipo ConversationMetadata (+ pendingGate*)
  - src/lib/conversation/meta.ts
  - src/lib/workers/gate-reengage-poll.ts # NOVO — molde: proposal-status-poll.ts
  - src/lib/chat/stream-watchdog.ts       # molde do watchdog client (web)
  # Regressão (3 camadas obrigatórias)
  - src/lib/agent/qualify-state.*.test.ts
  - src/lib/agent/orchestrator/runner.*.test.ts
  - tests/regression/agent-trajectory.test.ts
  - src/lib/agent/HARD_RULES.md
conflitos_esperados:
  - "Nenhuma onda concorrente ativa neste tema. A branch fix/funil-turno-orquestracao (que atacou a trava no gate de VALOR — FIX-115) JÁ está integrada na develop; este bloco parte da develop atual e ataca as facetas AINDA travadas (experiência→consent, dúvidas) + o watchdog geral. Worktree ativa /private/tmp/aja-fix-mesa é outro tema (mesa), sem colisão."
---

# Bloco — Funil não pode travar (auto-condução da jornada)

**Hotfix de classe** — não é 1 defeito isolado, é a **classe** "o agente explica/reage
e não puxa o próximo passo; o usuário fica esperando e precisa mandar 'continua/vai'".
O Kairo reportou em 2026-07-02 (WhatsApp, print no `_evidencia/`): clicou no botão de
experiência, o agente explicou consórcio e **travou por ~5 min**.

> **Decisão de produto já tomada (Kairo, AskUserQuestion 2026-07-02):**
> - **Estratégia = 1 + 3** (as DUAS): (1) puxar o próximo botão no MESMO turno **e**
>   (3) watchdog por inatividade como rede.
> - **Escopo = varrer TODOS os pontos de trava** (matar a classe, não só o do print).

## Por que 2 itens no mesmo bloco (1 agente/1 branch)

São mecanismos **complementares** que tocam a MESMA camada (orquestração do turno) e
cobrem faces diferentes do mesmo bug — por isso 1 agente faz os dois em sequência:

- **FIX-206 (estratégia 1)** — cobre o caminho **determinístico**: turnos server-authored
  (cliques de gate) e explicações fechadas SEMPRE oferecem o próximo passo no mesmo turno.
  Mata o beco sem saída (o do print).
- **FIX-207 (estratégia 3)** — cobre a **cauda não-determinística**: quando o gate é
  legitimamente suprimido (dúvida real classificada pelo LLM e consent já ofertado antes),
  um watchdog re-engaja se o usuário ficar parado. Rede de segurança pra qualquer trava futura.

Juntos = cobertura 100% (determinístico via 206, cauda via 207).

## Já coberto por ondas anteriores (NÃO refazer)

- **Trava no gate de VALOR** (`credit`): FIX-115 (backstop determinístico do valor em
  `analyze.ts:99-131`) + FIX-172/189 (guard de turno-mudo). Já na develop. Este bloco
  NÃO mexe no backstop de valor — ataca os gates **anteriores** (experiência/consent/dúvidas)
  e o mecanismo GERAL de re-engajamento.

Detalhe completo (root cause provado arquivo:linha, correção proposta, regressão) nos cards
`fix-206` e `fix-207`. O refinamento de execução (invariantes, ordem, 3 camadas) está no `_prompt.md`.
