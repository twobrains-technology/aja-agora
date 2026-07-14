---
id: FIX-336
titulo: "P0 — o agente MENTE: diz que a proposta saiu com bevi_proposals = 0 no banco"
status: done
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/whatsapp/proxy.ts
  - src/lib/whatsapp/processor.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/runner.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1 (juiz Sonnet, whatsapp 3/10)
commit: PENDENTE (preenchido no commit de fechamento do bloco)
executado_em: 2026-07-14
---

# FIX-336 — promessa FALSA de proposta (invariante I4 quebrado)

## Cenário exato (dossiê auto-whatsapp)

O agente afirma:

> "Sua proposta com a ITAÚ já saiu"

E o banco diz:

```sql
SELECT count(*) FROM bevi_proposals WHERE conversation_id='90b6c34f-…';  --> 0
```

**Nenhuma proposta existe.** O cliente foi informado de que a reserva dele está feita. Isso é o
pior tipo de defeito que este produto pode ter — é o invariante I4 ("nunca prometer o que não
aconteceu") quebrado com o cliente na linha.

## Root cause (provado pelo juiz)

O "tenho interesse" por **texto livre** não tem caminho determinístico no WhatsApp: só o
CLIQUE do botão passa por `handleInterest` (`interactive-handlers.ts:630`). Quando o usuário
escreve "quero essa" em vez de clicar, nada cria a proposta — e o modelo, sem nenhum fato que o
contradiga, **aluciná a confirmação**.

Na web esse caminho existe. No WhatsApp, não.

## Correção proposta

| O quê | Onde |
|---|---|
| "Tenho interesse" por TEXTO LIVRE tem que cair no MESMO handler determinístico do clique | `interactive-handlers.ts` / `proxy.ts` (detectar a intenção e rotear pra `handleInterest`) |
| **Invariante em código, não no prompt**: o modelo NÃO PODE afirmar que a proposta/reserva saiu se não existir linha em `bevi_proposals` para a conversa. Isso vira guard determinístico (mesma família de `isPrematureReservationClaim`, que hoje só pega a palavra "reservado") | `sanitizer.ts` — checar o FATO no banco, não a palavra |

## Regressão exigida
- Integração: usuário escreve "quero essa" (sem clicar) → a proposta É criada, ou o agente NÃO
  afirma que foi. Nunca as duas coisas divergindo.
- Integração: com `bevi_proposals = 0`, qualquer fala do modelo afirmando que a proposta saiu é
  bloqueada.

## Execução (2026-07-14)

Root cause real, achado via investigação: `handleInterest` (clique do botão, `interactive-
handlers.ts:630`) **já era self-service** desde o FIX-117/e9b25776 — não precisou de mudança. O
bug estava só no caminho de TEXTO LIVRE: `isInterestExpression`/`handlePendingHandoffText`
(`proxy.ts`) era resíduo do refactor que corrigiu o clique mas nunca voltou pro texto — ainda
disparava `startInterestHandoff` (handoff HUMANO), nunca o funil self-service. Além disso o
regex era ancorado (`^...$`) e não batia com frases reais do dossiê ("bora, tenho interesse").

Duas mudanças, nenhuma delas em `interactive-handlers.ts`/`orchestrator/index.ts` (escopo original
da spec, mas o código lá já estava correto):

1. **`proxy.ts`** — `isInterestExpression` agora testa por SEGMENTO (split por `,;.!?`), e o ramo
   que batia na expressão de interesse passou a chamar `runDirectiveWithOrchestrator` +
   `buildAdvanceToContractDirective` (o MESMO directive do clique), marcando `decisionDispatched`
   — em vez de `startInterestHandoff`. Guardas: exige `searchDispatched`, e não atropela
   `contractCollection`/`contractClosed` já ativos.
2. **`sanitizer.ts` + `runner.ts`** — novo `isProposalCompletionClaim` (família do FIX-270,
   `StateVerificationContext.hasProposal`) bloqueia qualquer fala do modelo tipo "sua proposta já
   saiu"/"proposta pronta/criada"/"vou processar seu interesse" quando `bevi_proposals` está vazio
   pra conversa — fato computado uma vez por turno via `getLatestBeviProposal`, nunca a narrativa
   do LLM.

Testes: `sanitizer.test.ts` (unit, `isProposalCompletionClaim` + drop/preserve por `hasProposal`)
e `proxy.fix-336-interest-text.test.ts` (novo — cobre roteamento self-service, falso-positivo
"tenho interesse em saber sobre lance", e os 3 guards de não-interceptação). TDD confirmado: os
dois arquivos de teste falham (RED) contra o código pré-fix (via `git stash` do arquivo de
produção) e passam (GREEN) com o fix aplicado.

Não reproduzido/verificado nesta sessão: integração end-to-end contra Postgres real (sem DB
disponível neste worktree) — a leitura de `hasProposal` via `getLatestBeviProposal` foi validada
por tsc limpo + revisão de código (mesma função já usada em `fulfillment.ts`/`contract-capture.ts`),
não por teste de integração ao vivo.
