---
id: FIX-120
titulo: "WhatsApp: valor do bem por conversa (não lista de faixas)"
status: done
commit: 7db49088
executado_em: 2026-07-01
severidade: alta
bloco: bloco-whatsapp-funil-paridade
arquivos: [src/lib/whatsapp/adapter.ts, src/lib/whatsapp/formatter.ts, src/lib/agent/qualify-config.ts, src/lib/agent/parse-asset-value.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---

## Origem (auditoria D5 — voz do operador na jornada canônica)

Divergência **D5** do Mapa em `docs/jornada/jornada-canonica.md` (rodada de auditoria
código×jornada de 2026-07-01, severidade **P1**). A **REGRA** (a voz do operador na
jornada, Passo 2 · "Entender o cliente") é:

> **Valor do bem — só o valor**, sem prazo, sem parcela, sem intents. No web é a
> **agulha simples**; no **WhatsApp é conversa** — o usuário **fala** "uns 80 mil".

O web já obedece: **FIX-115** deixou o gate `credit` emitir a agulha simples
(`value-picker.tsx`), que sem `onSubmit` manda o valor como **texto livre** no chat, e o
backstop determinístico `parseAssetValue` garante o avanço do funil. O WhatsApp ficou pra
trás: ainda dispara uma **lista interativa de faixas** ("Até R$ 50 mil", "R$ 50 a 100 mil"…)
em vez de perguntar e ouvir o valor. A regra deste card é **paridade com o comportamento
web já correto**.

## Cenário exato (comportamento divergente HOJE)

- **Canal:** WhatsApp (interativo).
- **Passos:** 1) Usuário passa por categoria + nome + experiência + consent + identidade.
  2) O funil chega ao gate `credit` (valor do bem). 3) Em vez de **perguntar** o valor por
  texto, o adapter envia uma **lista interativa** com a seção **"Faixas de valor do bem"** e
  4 faixas fixas por categoria. 4) O usuário escolhe uma **faixa** ("R$ 50 a 100 mil"), não
  diz o valor real — e o que fica gravado é o **teto da faixa** (`range.max`), não o valor
  que ele tem em mente.
- **Evidência (file:line):**
  - `src/lib/whatsapp/adapter.ts:50-54` — `gateInteractive`, case `"credit"` →
    `creditRangeQuestionToWhatsApp(category, prefix).interactive`. É o ponto que injeta a lista.
  - `src/lib/whatsapp/formatter.ts:494-521` — `creditRangeQuestionToWhatsApp`: monta um
    `interactive` do tipo `list`, seção com `title: "Faixas de valor do bem"` (`:510`), `rows`
    derivadas de `CREDIT_BUCKETS` (`:511-515`). É a lista que a jornada diz pra **não** existir.
  - `src/lib/agent/qualify-config.ts:8-11` — **contrato** do bloco-jornada-entrada: "a WEB a
    troca por um slider simples (1k em 1k), **o WhatsApp não manda mais a lista de faixas**".
  - `src/lib/agent/qualify-config.ts:45-52` — `QUALIFY_GATE_INPUT_KIND.credit === "conversation"`:
    o contrato **já classifica** o gate `credit` como conversa (não botão/lista).
  - **Web CORRETO (alvo de paridade):** `src/components/chat/artifacts/gate-renderer.tsx:49-61`
    (gate `credit` = agulha simples `ValuePicker`, sem `onSubmit` → manda valor como texto) +
    `src/lib/agent/orchestrator/analyze.ts:87-88` (backstop `parseAssetValue` grava o `creditMax`).

## Esperado × Atual

- **Esperado (paridade FIX-115):** no gate `credit` o WhatsApp **pergunta o valor por texto**
  ("Qual valor do bem faz mais sentido pra você?" — `gateQuestion("credit", category)`), o
  usuário responde livre ("uns 80 mil", "50k", "R$ 240.000"), o analyzer (LLM) + o backstop
  `parseAssetValue` extraem o `creditMax` e o funil avança. **Sem** lista de faixas.
- **Atual:** o WhatsApp manda a lista interativa de 4 faixas; o valor gravado é o `range.max`
  da faixa escolhida (`resolveCreditReply` → `handleCredit`), não o valor real dito pelo usuário
  — divergência de **input** (lista × conversa) e de **precisão** (faixa × valor exato).

## Root cause (INVESTIGADO — provado no código atual)

Confirmado lendo este worktree (gap **persiste** — não foi resolvido por FIX-113/114/115):

- O gate `credit` **ainda é emitido**: `nextGate` (`qualify-state.ts:56`) retorna `"credit"`
  enquanto `q.creditMax === undefined`. Correto — o que muda é só **como** ele é apresentado.
- No canal WhatsApp o gate `credit` continua materializando a **lista**: `gateInteractive`
  (`adapter.ts:50-54`) chama `creditRangeQuestionToWhatsApp`, que devolve o `interactive` do
  tipo `list` com a seção "Faixas de valor do bem" (`formatter.ts:494-521`). Esse é o
  comportamento **pré-FIX-104/115** que o contrato mandou remover.
- O **contrato já foi escrito** (bloco-jornada-entrada, `qualify-config.ts:8-11` +
  `QUALIFY_GATE_INPUT_KIND.credit === "conversation"`, `:48`) prevendo que o bloco irmão
  **whatsapp-apresentacao** faria o wiring do canal — **mas esse wiring nunca chegou ao
  adapter**. Ou seja: gap de implementação não-fechado, não gap já corrigido.
- A infra do caminho **conversacional já existe e funciona** — só não está sendo usada porque
  a lista intercepta antes: `analyze.ts:87-88` aplica `parseAssetValue(text)` como backstop na
  coleta inicial (`analysis.creditMax === null && q.creditMax === undefined`), e
  `src/lib/agent/parse-asset-value.ts` (FIX-115) já parseia "50k" / "50 mil" / "R$ 50.000" /
  "1,5 milhão". Uma resposta livre no WhatsApp **já seria capturada** pelo mesmo pipeline do web.
- **Detalhe de mecanismo a tratar no fix:** hoje a pergunta do valor viaja **dentro** do body
  da lista (`formatter.ts:499-500` embute `gateQuestion("credit", …)` no `body.text`). No
  handler do evento `gate` em `consumeEvents` (`adapter.ts:238-253`), quando há `ev.prefix` o
  `textBuffer` é **limpo** e só o `interactive` é enviado. Se apenas removermos a lista, a
  pergunta **some**. Logo o fix precisa **enviar a pergunta como texto** — espelhando o gate
  textual `identify` (`gateInteractive` retorna `null` em `adapter.ts:73-82`; o prompt de CPF
  sai como texto por `fireGate:351-355`). Vale pros **dois** caminhos do gate credit: o
  `gate` event em `consumeEvents` (`:238-253`) e o `fireGate` direto (`:340-358`).
- Consequência: `creditRangeQuestionToWhatsApp` (`formatter.ts:494-521`), `resolveCreditReply`
  (`formatter.ts:551-567`), o roteamento `credit_` (`interactive-handlers.ts:105`) e
  `handleCredit` (`interactive-handlers.ts:298-314`) viram **código morto** após o corte
  (nenhuma lista → nenhum reply `credit_*` chega).

## Correção proposta (o quê × onde)

Levar o gate `credit` do WhatsApp à **paridade com o web** — pergunta por texto, resposta
livre, captura pelo pipeline conversacional já existente.

| O quê | Onde |
|-------|------|
| Gate `credit` deixa de renderizar a lista: `gateInteractive` case `"credit"` **não** chama mais `creditRangeQuestionToWhatsApp` (retorna `null`, sem `interactive`) | `src/lib/whatsapp/adapter.ts:50-54` |
| Enviar a pergunta do valor como **texto** conversacional (`gateQuestion("credit", category)` = "Qual valor do bem faz mais sentido pra você?") nos dois caminhos do gate credit — espelhar o tratamento textual do `identify` | `src/lib/whatsapp/adapter.ts` — handler `gate` em `consumeEvents` (`:238-253`) + `fireGate` (`:340-358`) |
| Confiar no caminho conversacional já pronto pra capturar a resposta livre → grava `creditMax` (analyzer + backstop determinístico) | `src/lib/agent/orchestrator/analyze.ts:87-88` (já pronto) + **reuso** `src/lib/agent/parse-asset-value.ts` (FIX-115) |
| Aposentar `creditRangeQuestionToWhatsApp` (lista) + `resolveCreditReply` + roteamento `credit_` + `handleCredit` — código morto após o corte; não deixar import órfão | `src/lib/whatsapp/formatter.ts:494-521` e `:551-567`; `src/lib/whatsapp/interactive-handlers.ts:105` e `:298-314` |
| Atualizar o comentário-contrato `TODO(bloco-whatsapp-apresentacao)` — o wiring que faltava foi feito; `credit` = conversa no WhatsApp | `src/lib/agent/qualify-config.ts:8-11` e `:35-42` |
| **DECISÃO DE UX (confirmar via `AskUserQuestion`):** (a) usar o `gateQuestion("credit")` literal como texto **ou** deixar o agente perguntar no directive; (b) manter (por compat) ou remover `resolveCreditReply`/`handleCredit` pra um reply `credit_*` de uma lista já enviada em conversa em andamento (homologação: sem UI persistida, remoção é segura) | — |

Preservar o backstop `parseAssetValue` intacto (é a rede que impede o funil de travar quando o
analyzer LLM cai em `NEUTRAL_FALLBACK` — requisito do Kairo "se o componente não aparecer tem
que se resolver mesmo assim"). Não tocar `CREDIT_BUCKETS`: segue servindo `lanceValueOptions`
e como referência de faixa; só o gate `credit` para de consumi-lo no WhatsApp.

## Regressão exigida (3 camadas — bug de comportamento do agente/WhatsApp)

Por ser comportamento do funil no canal WhatsApp, seguir as **3 camadas** obrigatórias:

- **Camada 1 — Structural** (`src/lib/whatsapp/adapter.fix-120.test.ts` +
  `src/lib/agent/qualify-config.fix-120.test.ts`): assertar que `gateInteractive("credit", …)`
  retorna `null` (não emite `interactive` de lista); que **nenhum** `interactive` do gate credit
  contém a seção `"Faixas de valor do bem"`; que `QUALIFY_GATE_INPUT_KIND.credit === "conversation"`
  (trava o contrato); e que a pergunta textual (`gateQuestion("credit", category)`) é a saída do
  gate credit no WhatsApp. Complementar com o teste de reuso de `parseAssetValue("uns 80 mil") ===
  80000` (garante que o pipeline conversacional captura a resposta livre).
- **Camada 2 — Cassette** em `tests/regression/agent-trajectory.test.ts`: `describe` novo
  ("FIX-120 — WhatsApp valor do bem por conversa") com stream determinístico do gate credit no
  WhatsApp, assertando que o detector de **lista de faixas** ("Faixas de valor do bem") **não**
  dispara, que a **pergunta textual** aparece, e que uma resposta livre "uns 80 mil" leva a
  `creditMax = 80000` gravado com o funil avançando pro próximo gate. Cross-ref pro teste structural.
- **Camada 3 — Eval** (`tests/eval/agent-flow.eval.test.ts`, nightly): cenário WhatsApp de
  persona que, no passo 2, **diz** "uns 80 mil" e o funil grava 80k e avança — paridade com o
  cenário web equivalente. Só relatório, não gate.

**Fluxo TDD:** escrever Camadas 1+2, **ver falhar** (hoje o gate credit emite a lista de faixas),
aplicar o fix no `adapter.ts` (+ limpeza do código morto), ver as duas verdes, commit `test+fix:`
único.

**A REGRA é a paridade com o comportamento web já correto** (`gate-renderer.tsx:49-61` +
`analyze.ts:87-88`, FIX-115): o WhatsApp deve **perguntar e ouvir** o valor do bem por conversa,
exatamente como o web coleta pela agulha → texto livre → `parseAssetValue`.
