# Bloco — Reforma de conversa no WhatsApp (Fase 1: qualificação)

**Branch:** `feat/conversa-wa-cadencia` · **Onda:** 1 · **Data:** 2026-07-02
**Itens:** FIX-210 → FIX-211 → FIX-212 (executados nessa ordem)
**Commits:** `1845433` (FIX-210) · `72e5aa6` (FIX-211) · `f702a8d` (FIX-212)

## O que entrega (pitch)

A conversa do WhatsApp na qualificação (nome → consent → identify → valor →
lance/embutido) deixou de despejar bolhas longas e passou a **cadenciar** como um
humano: contexto num balão, pedido em outro. Três mudanças:

1. **Cadência 2-tempos (FIX-210):** o consent→identify não manda mais uma bolha
   juntando reação + porquê + LGPD + pedido do CPF. Agora vai **contexto (com o
   gancho do docx + LGPD)** num balão e **"me manda seu CPF"** em outro. O identify
   deixou de ter dois textos concorrentes — virou fonte única.
2. **Escada de cobrança (FIX-211):** se o usuário não informa o dado obrigatório
   (CPF/valor) — inclusive quando **desvia** com outra pergunta —, o bot **cobra de
   novo, escalando** o tom; após 3 tentativas, **oferece o especialista** (saída,
   nunca loop infinito).
3. **Zero emoji + tom curto (FIX-212):** nenhum emoji em toda a copy do WhatsApp
   (varredura de teste trava se voltar), regra dura no prompt, e o card de lance
   embutido deixou de ser 3 parágrafos de aula + pergunta — a educação virou balão
   de contexto e o card ficou só com a pergunta.

## Decisões de design (dentro da liberdade dos cards)

- **Contexto do identify é FIXO, não do LLM (FIX-210).** O card propunha "contexto
  curto do LLM", mas o gancho do docx ("analisar várias administradoras / aderentes
  ao seu perfil") + LGPD é **requisito de jornada** e não pode ficar à mercê do que
  o LLM improvisa. Decidi um beat de contexto **determinístico**
  (`IDENTIFY_CONTEXT_WHATSAPP`): garante o gancho E dá exatamente 2 balões. A reação
  do LLM ("Perfeito, bora lá!") é descartada nesse gate — o contexto fixo já acolhe.
- **`gateContextBeat` unifica identify e lance-embutido.** Em vez de lógica ad-hoc,
  criei um beat de contexto fixo por gate (identify: gancho+LGPD; lance-embutido:
  educação). Mesmo mecanismo no `consumeEvents` (gate event) e no `fireGate`
  (clique/watchdog).
- **Split do lance-embutido é channel-aware (FIX-212).** Não encurtei o
  `gateQuestion("lance-embutido")` (a **web** renderiza o card com educação +
  pergunta e testes dependem disso). Separei em `LANCE_EMBUTIDO_EDU` +
  `LANCE_EMBUTIDO_ASK`; `gateQuestion` **compõe** as duas (web inalterada), e o
  WhatsApp usa cada uma (educação no balão, pergunta no card).
- **Regra "sem emoji" é GLOBAL (web+whatsapp).** `buildSpecialistPrompt` não recebe
  canal; o card diz que sem-emoji na web é "desejado". Então a regra vale nos dois.
  A **cadência de balões** fica no adapter (render), não no prompt — channel-aware.
- **Escada é WhatsApp-only; watchdog não escala.** A escada (`attempt`) roda no
  fluxo de turno do adapter WhatsApp. `reengageQuestionForGate` ganhou `attempt=1`
  default → **web e watchdog inalterados** (compat). O watchdog de 90s re-emite a
  pergunta base (não escala) — gap consciente pra manter escopo.
- **Emoji removido também dos cards de reveal/fechamento (Fase 2/3).** O invariante
  é "zero emoji em TODA a copy do WhatsApp" e a varredura exigida cobre o
  `formatter.ts` inteiro. Remover emoji ≠ implementar Fase 2/3 (não toquei lógica,
  itens de card, `artifact-renderer.tsx` nem `closing-presentation.ts`).

## Copy final — antes → depois (pro Kairo revisar no simulador)

### Identify (gate do CPF) — FIX-210
**Antes (uma bolha só):**
> "Pra eu analisar várias administradoras e já buscar as opções mais aderentes ao
> seu perfil, preciso do seu CPF e celular — seus dados ficam protegidos (LGPD) e
> isso não é compromisso nenhum, tá?"
> _(e um segundo texto concorrente: "me envia seu CPF (só os números)... celular eu
> já tenho daqui do WhatsApp 😉")_

**Depois (2 balões):**
> **Balão 1 (contexto):** "Pra eu analisar várias administradoras e achar as opções
> mais aderentes ao seu perfil, preciso confirmar quem é você. Seus dados ficam
> protegidos (LGPD)."
> **Balão 2 (pedido):** "Me manda seu CPF, só os números. Seu celular eu já pego
> aqui do WhatsApp."

### Escada de cobrança do CPF/valor — FIX-211
- **1ª (pedido direto):** a pergunta base do gate (ex.: "Me manda seu CPF...").
- **2ª:** _pergunta base_ + "Só falta isso pra eu seguir — é rapidinho."
- **3ª:** _pergunta base_ + "É seguro e sem compromisso. Só preciso disso pra continuar."
- **4ª (saída):** "Se preferir, posso te conectar com um especialista pra te ajudar
  antes de seguir. É só me pedir."

### Lance embutido — FIX-212
**Antes (card único, 3 parágrafos + pergunta):**
> "Você sabe o que é lance embutido? Fica tranquilo, a gente te ajuda!\n\nEle
> permite usar parte da própria carta de crédito como lance — numa carta de R$ 100
> mil, por exemplo, você usa uma fatia desse valor pra aumentar suas chances de
> contemplação, sem precisar ter todo o lance em dinheiro hoje.\n\nQuer considerar
> esse tipo de lance nas suas simulações?" _(tudo no card, com botões)_

**Depois (2 tempos):**
> **Balão 1 (contexto/educação):** "Você sabe o que é lance embutido? Fica tranquilo,
> a gente te ajuda. É usar parte da própria carta de crédito como lance — numa carta
> de R$ 100 mil, por exemplo, você usa uma fatia desse valor pra aumentar suas
> chances de contemplação, sem precisar ter todo o lance em dinheiro hoje."
> **Balão 2 (card):** "Quer considerar esse tipo de lance nas suas simulações?" + botões

### Emojis removidos (FIX-212)
Toda a copy fixa do `formatter.ts` + `identify-capture.ts`: cards de grupo/simulação/
recomendação (💰📅⏱🎯📋📈⭐), profile summary (✅), chips de experiência/categoria
(🌱✅🤔🏠🚗🏍), cenários de contemplação (🟢🟡🔴), opt-in (👍), contrato/proposta
(🔒✅🎉), documentos (📄😊), simulador (🎯), confirmação do CPF (🔎). O texto **gerado**
pelo LLM é coberto pela regra dura no system-prompt ("NUNCA use emoji").

## Testes (as 3 camadas) — todos "falharam antes"

| Camada | Arquivo | Provou "falhou antes" |
|---|---|---|
| 1 | `src/lib/whatsapp/adapter.cadencia-fix210.test.ts` | 1 bolha só (sendText 1x) antes; 2 balões depois |
| 1 | `src/lib/agent/gate-reengage.escada.test.ts` | `SPECIALIST_EXIT_OFFER`/`attempt` não existiam |
| 1 | `src/lib/whatsapp/adapter.escada-fix211.test.ts` | desvio não re-cobrava; sem `gateAttempts` |
| 1 | `src/lib/whatsapp/no-emoji-fix212.test.ts` | 40+ emojis no formatter + regra ausente |
| 1 | `src/lib/whatsapp/adapter.lance-split-fix212.test.ts` | card carregava a aula inteira |
| 2 | `tests/regression/agent-trajectory.test.ts` | 3 `describe` novos (FIX-210/211/212), append determinístico |

Também corrigidos (dívida pré-existente que estava vermelha no HEAD):
`jornada-docx-copy.test.ts` (gancho/LGPD migraram pro beat de contexto) e o assert
FIX-120 em `agent-trajectory` (procurava `gateQuestion("credit")` literal inexistente).

## Gate (container transitório — host sem node_modules)
- `pnpm test:unit`: **273 arquivos / 2693 testes verdes**. Única falha:
  `webhook.message-template-status.test.ts` (3 testes) — **ambiental**
  (`ECONNREFUSED :3000`, precisa de servidor HTTP), **idêntica no HEAD**, não é
  regressão deste bloco.
- `tsc --noEmit`: **0 erros nos arquivos tocados** (3 erros totais, todos
  pré-existentes em arquivos não tocados — dívida de test files).
- **Web (C5):** route tests sem-seed passam (`route.test.ts`, `handoff-echo`,
  `closing-persistence`, `contract-error-logging`). Os 2 que falham
  (`admin-message-persistence`, `lead-form-prefill`) **falham idêntico no HEAD**
  (dependem de DB seed/examples da migração 0016 que o container transitório não
  tem) — não é regressão de copy/emoji.

## Gaps honestos
- **Watchdog de 90s não escala** a escada (só re-emite a pergunta base) — decisão de
  escopo; a escada roda no fluxo de turno (mudo + desvio).
- **Fora da janela 24h:** a escada não se aplica (é template Meta aprovado) —
  documentado no card FIX-211, não coberto aqui.
- **Route tests que dependem de DB seed** não foram validados no container (falham no
  HEAD também); a validação da web foi feita nos route tests que rodam sem seed +
  na garantia de que a copy compartilhada muda de forma channel-aware.
- **Reação do LLM descartada no gate identify:** no consent→identify o "Perfeito!"
  do LLM some (substituído pelo contexto fixo). É o custo de garantir o gancho
  determinístico; se o Kairo quiser preservar a micro-reação, dá pra emitir como
  balão 0 antes do contexto (fácil de reverter).
