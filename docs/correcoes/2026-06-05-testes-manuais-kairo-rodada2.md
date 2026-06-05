# Correções — testes manuais do Kairo · RODADA 2 (tarde de 2026-06-05)

> Continuação de [`2026-06-05-testes-manuais-kairo.md`](./2026-06-05-testes-manuais-kairo.md)
> (FIX-1..FIX-10, executados de manhã). Esta rodada nasceu do re-teste em tela APÓS o
> deploy do lote 1, na mesma branch `feat/jornada-bevi-lance-embutido`.
> Status: **ANOTADO — aguardando estruturação/execução**

---

## FIX-11 — Pós-fechamento amnésico: agent nega o que acabou de fazer, re-roda a descoberta e oferece OUTRA administradora

### O que o Kairo viu (palavras dele)

> "Anota isso daqui, por favor, como um comportamento errado. [...] não faz sentido
> nenhum como que se comportou aqui, tá? E a gente tem que corrigir. **Por que mostrou
> dois consórcios diferentes? Isso daí é um erro que não é aceitável.** Porque quando
> eu perguntei o status, ele foi lá e buscou de novo os grupos. Não faz sentido nenhum.
> **O agente ainda está muito ruim.**"

### Cenário exato (prints da conversa, 2026-06-05 ~17:43–18:06)

1. Jornada completa e CORRETA até o fim: qualificação (moto, R$ 40 mil, ~8 meses,
   R$ 800/mês, sem lance) → identify → **carta REAL confirmada com a CANOPUS**
   (R$ 46.000 · parcela R$ 469,95 · grupo 4400) → "Confirmo essa carta" → proposta
   pronta → docs enviados → *"Recebi seus documentos ✅. É isso — sua ficha está
   completa! Agora é com a administradora; te aviso de cada passo."*
2. Usuário pergunta: **"qual status da proposta?"**
3. Agent responde (tudo errado, no mesmo turno):
   - *"Kairo, ainda não recebi nenhum dado ou documento por aqui — **nada chegou no
     nosso sistema nesse chat**."* → **contradiz frontalmente o turno imediatamente
     anterior** (e a realidade: proposta `6a230bb1…bd089b` criada na Bevi, docs upados,
     `bevi_proposals.proposal_status = 'documentos'`).
   - **Re-roda a DESCOBERTA** com os params da qualificação ("os grupos disponíveis
     hoje para R$ 40.000 em moto têm parcelas acima de R$ 800,00/mês...").
   - Apresenta **recommendation_card + simulation_result NOVOS de OUTRA
     administradora** (BANCO DO BRASIL, R$ 35.543, R$ 2.872,71/mês, 17 meses) — pro
     usuário que **já contratou CANOPUS** nessa mesma conversa.
   - Fecha oferecendo "Quer ajustar o valor do bem ou o orçamento mensal?" — como se
     a jornada estivesse no passo 3.

### Root cause (investigado no código + DB, prova abaixo)

**Defeito A — mensagens do fechamento NÃO são persistidas (causa primária).**
Os handlers de action do route (`src/app/api/chat/route.ts`) escrevem os textos do
fechamento direto no stream da UI via `pipeClosingItems()` / `writer.write(text-delta)`
**sem nenhum `saveMessage`**: `contract-submit` ("Confirmei com a CANOPUS…"),
`offer-confirm` (reforços + "Parabéns!"), `documents-done` ("Recebi seus documentos ✅…")
e `document-upload`. Histórico REAL persistido da conversa do teste (query no DB local):

```
user      | qual status da proposta?          | 18:06
user      | Enviei meus documentos            | 17:48
user      | Confirmo essa carta               | 17:47
user      | Enviei meus dados pra contratar   | 17:47
assistant | Boa escolha, Kairo! …             | 17:47   ← última assistant SALVA
```

**Quatro mensagens `user` consecutivas, ZERO `assistant` entre elas.** No turno
seguinte, `loadConversationHistory` entrega esse histórico mutilado ao modelo — que
"vê" o usuário dizendo que enviou dados/documentos **sem nenhuma confirmação do
sistema** e conclui (coerente com o que recebeu): "nada chegou no nosso sistema".
A alucinação é INDUZIDA pelo histórico, não inventada pelo modelo.

**Defeito B — o estado terminal não entra no system prompt.**
`meta.contractClosed` é setado no `offer-confirm` (route.ts:460), mas **nenhuma seção
do prompt** o consome (diferente do optin WhatsApp, que ganhou estágio derivado no
FIX-5). O modelo não tem como saber que existe contrato fechado (administradora, grupo,
valor, docs enviados) — mesmo com histórico íntegro, responder "qual status?" exigiria
inferência frágil do texto.

**Defeito C — runner não suprime artifacts de descoberta pós-fechamento.**
O guard `isContractDup` (runner.ts:193, fix BUG-POS-FECHAMENTO-NAO-TERMINAL de
2026-06-04) bloqueia APENAS `contract_form` quando `contractClosed === true`.
`recommendation_card`, `simulation_result` e o dial passam livres — por isso os "dois
consórcios diferentes" na mesma conversa. Viola a regra D13/D11 (números/artefatos
críticos decididos pelo servidor).

**Defeito D — "qual status da proposta?" não tem caminho de resposta real.**
`BeviApiAdapter.getStatus` (consult_proposal_status) existe, testado, **sem call site
em runtime** — é exatamente o G1 da próxima feature
([`docs/jornada/jornada-ate-boleto.md`](../jornada/jornada-ate-boleto.md), POC já
executada hoje: endpoint funciona e devolve `statusName`/`changesHistory`). Sem a tool,
o mínimo aceitável é responder do ESTADO SALVO ("sua proposta com a CANOPUS, grupo
4400, está com a administradora — documentos recebidos; te aviso de cada passo").

### Correção proposta (estruturar antes de executar — TDD 3 camadas em todas)

| # | Correção | Onde |
|---|---|---|
| A | Persistir TODA mensagem assistant escrita pelos handlers de action: `pipeClosingItems` ganha persistência (ou wrapper `pipeAndSave`) e `documents-done`/`document-upload` salvam o texto com `saveMessage(..., "assistant", ...)`. Auditar os demais handlers do route que escrevem texto sem salvar (incl. erros/`noOffer`). | `src/app/api/chat/route.ts` |
| B | Seção dinâmica de estado no prompt quando `contractClosed` (análoga ao `whatsappOptinStage`): "contrato FECHADO com {administradora}, grupo {grupo}, {valor}; NÃO buscar grupos, NÃO recomendar outra administradora; perguntas de status → responder do estado e avisar que acompanhamos". Derivada de `meta` + `bevi_proposals`. | `system-prompt.ts`, `agents/index.ts`, `builder` |
| C | Guard server-side no runner: `contractClosed === true` → suprimir `recommendation_card`/`simulation_result`/dial (mesma família do `isContractDup`/single-option guard). | `orchestrator/runner.ts` |
| D | Resposta de status do estado salvo (curto prazo). Tool real de `getStatus` + acompanhamento ativo = próxima feature (jornada-ate-boleto), NÃO entra neste fix. | `route`/diretiva |

### Regressão exigida (regra das 3 camadas do CLAUDE.md)

- **Camada 1**: asserts estruturais — handlers persistem (teste de integração do route
  com DB: pós `documents-done`, histórico contém a mensagem); prompt contém seção de
  contrato fechado quando `contractClosed`; guard novo no runner.
- **Camada 2**: cassette novo `FIX-11-POS-FECHAMENTO-AMNESICO` em
  `tests/regression/agent-trajectory.test.ts` — estado `contractClosed` + pergunta de
  status; detector: resposta NÃO nega recebimento, NENHUM
  `recommendation_card`/`simulation_result` emitido, NENHUMA tool de busca chamada.
- **Camada 3**: cenário no eval da jornada — pós-fechamento, "qual status da proposta?"
  responde do estado sem re-descoberta (rubric: punir negação de estado e segunda
  administradora).

### Evidências

- Prints da conversa completa (sessão 2026-06-05 tarde, imagens 27–30 + transcrição).
- Query do histórico no DB local do workspace (acima).
- Proposta real na Bevi: `6a230bb110ffff8984bd089b` — status REAL às 18:30 UTC:
  `waitingForUniqueCode` ("Aguardando inserção da proposta") — ou seja, a resposta
  correta EXISTIA e era consultável (POC no doc da próxima feature).
