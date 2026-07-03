---
id: FIX-210
titulo: "Cadenciar entrega de gate no WhatsApp em 2 tempos (contexto → pedido) e aplicar no CPF"
status: done
commit: 1845433
executado_em: 2026-07-02
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/whatsapp/adapter.ts
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-02 — reforma de conversa WhatsApp (Fase 1), spec docs/design/specs/2026-07-02-conversa-whatsapp-cadencia-design.md
---
## Palavras do operador
> "essa mensagem aqui tem que ser cadenciada. explica, depois manda uma: me informa seu cpf"
> "olha para todas as mensagens no whatsapp e vamos bolar uma estratégia melhor de conversa"

## Cenário exato
- **Canal:** WhatsApp. **Etapa:** clique em "Bora!" (consent) → funil vai pro gate `identify`.
- **Passos:** 1) usuário clica "Bora!"; 2) recebe UMA bolha longa juntando reação + porquê + LGPD + o
  pedido do CPF.
- **Print real:** *"Perfeito, bora lá! Pra eu analisar várias administradoras e já buscar as opções
  mais aderentes ao seu perfil, preciso do seu CPF e celular — seus dados ficam protegidos (LGPD) e
  isso não é compromisso nenhum, tá?"*

## Esperado × Atual
- **Esperado (C1 do spec):** balão curto de contexto → balão curto com o pedido direto (≤ ~160 chars
  cada). Nenhuma bolha junta explicação longa + pedido.
- **Atual:** tudo numa bolha. E há inconsistência: `IDENTIFY_WHATSAPP_PROMPT` (identify-capture.ts:20)
  diz "me envia seu CPF (só os números)... celular eu já tenho" enquanto `gateQuestion("identify")`
  (gate-questions.ts:41) diz "preciso do seu CPF e celular" — dois textos concorrentes.

## Root cause (INVESTIGADO)
No `consumeEvents` (adapter.ts) o gate, quando carrega `prefix`, ou **descarta** o texto do LLM
(`textBuffer=""`, adapter.ts:~268) ou o **cola** na pergunta do gate (`gateTextPrompt` retorna
`prefix + "\n\n" + question`) → uma bolha só. Não há o conceito de "beat de contexto" + "beat de
pedido". O identify tem dois textos (identify-capture.ts:20 e gate-questions.ts:41), e o caminho
usado varia (fireGate vs gateTextPrompt).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Introduzir cadência 2-tempos na entrega de gate: quando há contexto + pedido, emitir DOIS balões deliberados (contexto curto do LLM, depois pedido curto do gate) em vez de colar/descartar o prefix | `src/lib/whatsapp/adapter.ts` (consumeEvents / gateTextPrompt / fireGate) |
| Unificar o texto do identify num só (o bom: "me manda seu CPF, só os números; celular eu já pego aqui do WhatsApp") e encurtar | `identify-capture.ts` + `gate-questions.ts` (remover a duplicação) |
| Copy proposta (sem emoji): beat 1 "Pra comparar as administradoras e achar sua melhor opção, só preciso confirmar quem é você." · beat 2 "Me manda seu CPF, só os números. Seu celular eu já pego aqui do WhatsApp." | mesma origem |

**Channel-aware (C5):** a cadência 2-tempos é decisão de RENDER do WhatsApp — não vaza pra lógica
compartilhada. Não mexer na web. Rodar os testes de `route.ts` (web) antes de pushar.

## Regressão exigida
- **Camada 1 (estrutural):** o identify tem UM texto só; o texto do pedido é curto (≤ ~160 chars) e
  sem o "preciso do CPF e celular" antigo.
- **Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`):** cassette do consent→identify
  no WhatsApp emitindo 2 balões (contexto + pedido), NÃO uma bolha só; assert de que a pergunta do CPF
  sai como beat próprio.
- Ver a regra das 3 camadas em CLAUDE.md ("Regressão de agent — 3 camadas OBRIGATÓRIAS").
