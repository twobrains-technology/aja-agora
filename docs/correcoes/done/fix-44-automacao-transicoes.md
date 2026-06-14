---
id: FIX-44
titulo: "Automação das raias de fechamento (proposta automática + worker de polling da mesa) + forward-only"
status: done
commit: 49651a9
executado_em: 2026-06-14
bloco: bloco-b-funil-raias
arquivos:
  - src/lib/admin/lead-stage-tracker.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/whatsapp/proxy.ts
  - src/lib/bevi/proposal-repo.ts
  - src/lib/bevi/proposal-status.ts
  - src/lib/workers/proposal-status-poll.ts   # novo (BullMQ)
  - src/app/api/admin/leads/[id]/stage/route.ts
rodada: 2026-06-14 — anotação Funil + Cliente unificado + Retorno web (Kairo, voz)
---

# FIX-44 — Automação das raias de fechamento

## Palavras do operador

> *"a proposta bevi é automática hoje, ela é gerada para bevi e tenho até um pdf
> da bevi. O que acontece manual é a mesa — alguém vai lá na operadora, faz tudo
> que precisa ser feito e depois volta com o contrato e boleto, atualiza no
> sistema da Conexia."* · *"pode mapear e pensar em um pooling via worker do aja
> agora. worker usamos bullmq e back junto aqui no mesmo projeto, mesmo container
> se der."*

## Cenário / problema

A **proposta Bevi já é gerada automaticamente** (com PDF). A **API de Parceiro
cobre até o envio de documento** (link pro cliente anexar e fechar a
auto-contratação, `waitingForUniqueCode`). Daí em diante quem move é a **MESA**
(back office humano), com **timing definido pela Conexia**. O sistema **não é
notificado** — só sabe se **consultar o status** (polling). Hoje o polling
(`check_proposal_status`, FIX-14) só roda sob demanda no chat e **não move a
raia**. Logo, o funil não reflete o fechamento sozinho.

## Root cause investigado (código + resposta do Kairo)

- `proposal-repo.ts:36-102` — `createBeviProposal`/`updateBeviProposal` gravam
  `proposalStatus` mas **não tocam a raia do lead**.
- `proposal-status.ts` (FIX-14) — `getStatus`/`check_proposal_status` consultam a
  administradora AO VIVO, mas só quando o **usuário pergunta**; **nenhum call site
  atualiza a raia** nem roda agendado.
- `runner.ts:39-41` — `LEAD_STAGE_BY_TOOL` só cobre simulação/recomendação.
- `api/admin/leads/[id]/stage/route.ts` — PATCH sem `onlyAdvance`; admin regride
  em silêncio.
- **Sem webhook** (confirmado na POC). **Máquina de estados do desfecho fornecida
  pelo Kairo (2026-06-14)** — movida pela mesa, timing da Conexia:

  | Status sistêmico | Nome | Raia |
  |---|---|---|
  | `approveWaitingForUniqueCode` | Inserir proposta | Na administradora (mesa) |
  | `aguard_pag_cliente` | Aguardando Pagto Cliente | Aguardando pagamento |
  | `prop_efetivada` | Proposta Efetivada | Fechado — ganho |
  | `approved` | Aprovada | Fechado — ganho |
  | `repproved` | Reprovado | Perdido |

## Correção proposta

| O quê | Onde |
|---|---|
| `createBeviProposal` → mover lead/contato pra `proposta_enviada` (system, onlyAdvance) — amarra a raia ao evento que **já existe** | `proposal-repo.ts` → `transitionLeadStage` |
| **Worker de polling (BullMQ)** no próprio aja-agora (mesmo projeto/container se der — **implica Redis**): job recorrente que consulta `consult_proposal_status` por proposta pendente, **mapeia status→raia** (tabela acima) e dispara mensagem proativa no canal (web/WhatsApp) por transição nova do `changesHistory` | `src/lib/workers/proposal-status-poll.ts` (novo) + `proposal-status.ts` |
| "Em negociação" também por card de decisão aberto / `simulate_quota` repetida pós-recomendação (não só handoff) | `runner.ts` / tracker |
| `Perdido`: `repproved` (status) **ou** inatividade > N dias (timeout **nosso** — a API não expira proposta abandonada) | `lead-stage-tracker.ts` / worker |
| Rota de stage: regressão exige flag explícita; default forward-only; registra em `lead_events` | `api/admin/leads/[id]/stage/route.ts` |

> **Infra:** o worker exige **Redis** pro BullMQ — avaliar reuso/sidecar no mesmo
> container ("mesmo container se der", Kairo). A máquina de estados do desfecho
> **já é conhecida** (não há mais gap de estado). Resta confirmar qual transição
> dispara a **comissão** (provável saída de `aguard_pag_cliente` → `prop_efetivada`).

## Regressão exigida (CLAUDE.md) — 3 camadas (toca comportamento do agente)

- **Camada 1 (structural):** `createBeviProposal` dispara `proposta_enviada`; mapa
  status→raia exatamente como a tabela; rota rejeita regressão sem flag.
- **Camada 2 (cassette, OBRIGATÓRIA):** em `agent-trajectory.test.ts`, fluxo cria
  proposta → asserta raia `proposta_enviada`. Bug-alvo: "proposta nasce, raia não
  move". Ver falhar antes.
- **Camada 3 (eval, nightly):** cenário web→proposta checando a raia no DB.
- **Integration (DB real):** worker recebe `getStatus` com `changesHistory`
  contendo cada status (fixture) → asserta a raia resultante por status
  (`approveWaitingForUniqueCode`→na_administradora … `repproved`→perdido) +
  idempotência (re-poll não duplica transição).
