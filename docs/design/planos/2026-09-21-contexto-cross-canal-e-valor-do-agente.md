# Contexto entre canais e coerência de valor do agente — Plano de implementação

**Goal:** fazer o agente falar a partir do **estado real do servidor** — a pessoa (não a conversa), a
simulação que ele mesmo rodou e a proposta que existe — em vez de afirmar estado que ninguém gravou.
**Arquitetura:** o runtime é o grafo LangGraph (`src/lib/agent/langgraph/`); os fatos do turno são
montados em `nodes/contexto-da-tela.ts` e consumidos pelo modelo; invariantes verificáveis viram
código determinístico (guard ancorado em estado), nunca regex de fala. **Stack:** TS/Next + LangGraph,
Drizzle/Postgres, Vitest, Langfuse.

## Contexto

Crítica de conversas reais de 21/09/2026 (web `fb913503` + WhatsApp `494d40b0`), traces do Langfuse e
tabelas `bevi_proposals`/`leads`. **A mesma pessoa** (telefone `556292496793` no WhatsApp e
`62992496793` no web) viveu uma contradição entre canais: a web disse "proposta registrada", o
WhatsApp respondeu "não aparece nenhuma proposta aqui". O fecho trocou o valor do contrato (pediu
R$ 80.000, fechou carta de R$ 120.000).

### O que o código confirma (validado nesta worktree @ `d3c7f36b`)

| # | Afirmação | Veredito | Evidência |
|---|---|---|---|
| 1 | A consulta é **por conversa**, não por pessoa | CONFIRMA | `getLatestBeviProposal` filtra `eq(beviProposals.conversationId, ...)` — `src/lib/bevi/proposal-repo.ts:118-127`; `checkProposalStatus(conversationId)` — `src/lib/bevi/proposal-status.ts:203` |
| 2 | Não existe função de proposta por telefone | CONFIRMA | não há `getProposalByPhone` em `src/lib/bevi`, `admin`, `memory`. Por **contactId** existe fora dessas pastas: `src/lib/chat/recovery.ts:180`, `src/lib/workers/remarketing-cycle.ts:411` |
| 3 | Duas definições de `check_proposal_status` | CONFIRMA | estática (sentinel `STATUS_NO_CONTEXT`) `src/lib/agent/tools/ai-sdk.ts:1209`; factory (closure `conversationId`) `:1934`, registrada no retorno `:1966` — **a de runtime é a :1934** |
| 4 | Não há portão de confirmação de valor | CONFIRMA | o valor enviado é `meta.contractOffer?.creditValue ?? dicaDentroDoTeto ?? tetoDeclarado ?? 50000` (`src/lib/bevi/contract-input.ts:168`); o único detector de troca é o aviso CDC por `rawCreditValue` (`src/lib/bevi/closing-presentation.ts:99`) |
| 5 | "Proposta registrada" não é derivada de `bevi_proposals` | CONFIRMA | o guard `isPrematureReservationClaim` (`src/lib/agent/orchestrator/sanitizer.ts:190`) só cobre léxico de reserva; não há guard para afirmação de **registro** |
| 6 | Card usado não tem estado persistido | CONFIRMA (parcial) | `quick_reply` some por estado local `submitted` (`src/components/chat/artifacts/quick-reply.tsx:88`) e cards antigos são selados por `isLast` (`artifact-renderer.tsx:44-56`); **não há** consumo persistido — recarregar a página devolve o botão |
| 7 | Card pode ser emitido sem texto | CONFIRMA | `converse.ts:1343` empurra só `{type:"artifact"}`; `pedeFalaDepoisDasTools` devolve `false` para presentation |
| 8 | `human` é gravado `level=ERROR` na pausa normal | CONFIRMA (origem) | `interrupt("aguardando-resposta-do-usuario")` em `src/lib/agent/langgraph/graph.ts:38`; o `level` nasce no `CallbackHandler` do LangChain (`src/lib/observability/langfuse/langchain.ts:13`), não no app |
| 9 | Geração sem `model` | CONFIRMA | o app nunca seta `model:`; o campo vem do handler do LangChain |

### Onde o texto enviado **diverge** do código (o código manda)

- **Juízes do Langfuse (`litellm.tb.local:4000`) não vivem neste repo.** São *evaluators* gerenciados
  do servidor Langfuse, com conexão configurada na UI do servidor. O `LANGFUSE_BASE_URL` do app é
  outro (`https://langfuse.twobrainstechnology.com`). **Não é corrigível por código deste repo** —
  vira item de operação, registrado em Riscos.
- **O fecho não deveria ler a simulação; ele lê a oferta REAL da Bevi** (`startContract` →
  `gateway.simulate` → `partnerOfferToRealOffer`/`pickClosestOffer`, `src/lib/bevi/fulfillment.ts`).
  Ou seja, o agente recebeu mesmo uma carta de 120k — o defeito não é só a fala, é **não haver
  confirmação** entre "o que o cliente viu" e "o que a Bevi ofereceu".
- **`quick_reply` já some após o clique** no turno corrente; o defeito real é a falta de consumo
  persistido (recarga devolve o botão) e a ausência de ajuda quando o cliente clica de novo.
- **Há duas `normalizePhoneBR` com semânticas opostas**: `src/lib/memory/identity.ts:43` devolve E.164
  (`+55…`); `src/lib/leads/phone.ts:8` devolve só dígitos e é o que grava `contacts.phone`. A chave
  tolerante a `55`/9º dígito precisa reconciliar as duas — comparar direto diverge.

## O que muda

1. **Ver por pessoa (prio 1).** Busca de proposta/simulação por **identidade** (telefone→`contactId`),
   agregando todas as conversas do mesmo telefone, com chave tolerante (`55` e 9º dígito). Dossiê da
   pessoa montado no contexto do turno: última simulação (valor do bem, administradora, grupo,
   parcela, prazo), propostas e status, estágio do funil, cards escolhidos no site, e o que a web
   afirmou. Sem nada encontrado, dizer **o que falta**.
2. **Valor coerente (prio 2).** O valor pedido é o valor do contrato. Se a oferta real divergir do que
   o cliente viu, entra **escolha explícita e anterior** ao fechamento, nunca surpresa no resumo.
   Portão determinístico antes de registrar a proposta; o resumo deriva do **objeto da simulação**.
3. **Registro honesto (prio 3).** A frase de "proposta registrada" deriva de `bevi_proposals`
   (existe? digo; não existe? digo o próximo passo), ancorada em `ctx.hasProposal` — mesmo padrão do
   `isPrematureReservationClaim`, que deixa a MESMA frase passar quando a proposta existe.
4. **Cards e retomada (prio 4/5).** Consumo de `quick_reply` persistido por conversa+replyId (recarga
   não devolve o botão); todo card de dado acompanha frase de apoio; não reabrir qualificação já
   respondida (o contexto devolve o que já foi respondido).
5. **Instrumentação (prio 6).** `human` deixa de ser `ERROR` falso; a geração carrega o **modelo** no
   metadata; o turno mede o todo (app e Langfuse alinhados).

## O que NÃO muda

- **Nada de regex de fala.** Guard novo só com **âncora de estado** (fato no servidor que a fala
  contradiz). Tom/fluidez/repetição → Langfuse, nunca código.
- **Nenhuma lane edita `SYSTEM_PROMPT` (`src/lib/agent/system-prompt.ts`) nem `BASE_SYSTEM_INSTRUCTION`
  (`src/lib/agent/turn-analyzer.ts`).** Prompt de produção vive no Langfuse; publicar muda produção em
  ≤60s. Se um ajuste de prompt for inevitável, fica **registrado como pendente de ordem** e **não é
  sincronizado** (`pnpm sync-prompts` proibido nesta missão).
- A ordem do funil continua no `nextGate` (`qualify-state.ts`) — não é tocada.
- `REMARKETING_ATIVO` e o comportamento ausente-desligado ficam como estão.
- Nada de deploy, push, PR.

## Critério de pronto (verificável por comando)

- `pnpm typecheck` limpo na base **depois** do merge de todas as lanes.
- Testes de comportamento novos e verdes, por lane, provando **o fato de estado**:
  - pessoa: proposta encontrada **em outra conversa** do mesmo telefone é reportada (e o telefone sem
    o `55`/com 9º dígito casa);
  - valor: oferta real divergente do valor visto **não** segue sem confirmação explícita;
  - registro: "registrada" com `hasProposal=false` é barrada e com `hasProposal=true` **passa**;
  - cards: `quick_reply` consumido não volta após reload;
- Gate integrado (após merge) verde, e a suíte dirigida das áreas tocadas verde.

## Riscos

| Risco | Mitigação |
|---|---|
| Juízes do Langfuse fora do repo (não corrigível aqui) | registrar como pendência de operação; não "consertar" no código |
| Duas normalizações de telefone → falso negativo | lane da pessoa reconcilia as duas e testa os dois formatos |
| Guard de registro amordaçar fala legítima | ancorar em `ctx.hasProposal` (passa quando existe), mesmo desenho do guard de reserva |
| `converse.ts` é monólito compartilhado | pertence a UMA lane; outras escrevem pendência em `.orientacao/pendencia-<lane>.md` |
| Publicar prompt por engano | proibido `pnpm sync-prompts`; prompt fica pendente de ordem |
| Alterar comportamento de produção não medido | nada de deploy; entrega é commit local + gate |

---

## Board das lanes

| Lane | Decisão exata | Arquivos reivindicados | Gate | Por que é independente |
|---|---|---|---|---|
| **L1 pessoa** | consulta e dossiê por pessoa | `src/lib/bevi/proposal-repo.ts`, `src/lib/bevi/proposal-status.ts`, NOVO `src/lib/bevi/pessoa.ts`, `src/lib/agent/langgraph/nodes/contexto-da-tela.ts`, `src/lib/agent/tools/ai-sdk.ts` | `pnpm typecheck && pnpm exec vitest run <novos>` | toca o bevi + contexto-da-tela; nenhuma outra lane edita esses |
| **L2 valor** | portão de valor + resumo derivado | `src/lib/bevi/contract-input.ts`, `src/lib/bevi/closing-presentation.ts`, `src/lib/bevi/fulfillment.ts`, NOVO guard | idem | arquivos de bevi/fulfillment, disjuntos de L1 (que não edita esses três) |
| **L3 registro** | guard de "registrada" ancorado em `hasProposal` | `src/lib/agent/orchestrator/sanitizer.ts`, `src/lib/agent/orchestrator/types.ts` | idem | sanitizer/ctx; disjunto |
| **L4 cards** | consumo persistido + texto de apoio + retomada | `src/components/chat/artifacts/quick-reply.tsx`, `src/components/chat/artifact-renderer.tsx`, `src/components/chat/chat-message.tsx`, `src/lib/agent/langgraph/nodes/converse.ts`, `src/app/api/chat/route.ts` | idem | UI web + converse/route |
| **L5 instrumentação** | human sem ERROR falso, modelo na geração, turno inteiro | `src/lib/observability/langfuse/turn.ts`, `.../langchain.ts`, `src/lib/telemetry/turn-trace.ts`, `src/lib/agent/langgraph/run-turn.ts`, `src/lib/observability/alerta/dossie.ts` | idem | observabilidade; disjunto |

**Corrente:** nenhuma lane depende de outra para começar (todas leem o estado atual do código). O
merge e o gate integrado são do **agente integrador**, não do líder.