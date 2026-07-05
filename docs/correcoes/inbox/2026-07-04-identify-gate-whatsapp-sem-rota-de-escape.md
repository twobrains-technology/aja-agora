---
titulo: "Gate identify forçado no WhatsApp não tem rota de escape (handoff/cancelamento) — risco de trava"
status: inbox
severidade: media
projeto: aja-agora
origem: revisão adversarial Opus da onda ata-mudancas-aja (concern 5 do FIX-217)
arquivos:
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/whatsapp/processor.ts
rodada: 2026-07-04 — follow-up da onda ata-mudancas-aja (decisão de produto pendente)
---
## Contexto
O FIX-217 (Ata 2026-07-04) tornou o gate `identify` no WhatsApp **determinístico e forçado**:
enquanto o gate está ativo, QUALQUER texto do usuário é interceptado (`ask-cpf`) e reemite o
pedido de CPF, nunca caindo no pipeline geral do agente. Isso corrigiu o bug real do inbox
(`2026-07-01-whatsapp-identify-gate`) — o agente narrava a busca sem coletar o CPF. **É a trava
dura pretendida (Lei 4 — invariante em código).**

## O risco (achado na revisão adversarial)
A **única** saída textual do gate é o back-intent (`volta`/`voltar`, `BACK_INTENT_REGEX`). Não há
rota de **handoff** nem de **cancelamento**:
- Usuário digitando "por que preciso do CPF?", "não quero passar meu CPF", "quero falar com
  atendente", "cancelar", "sair" → **sempre** reemite o pedido de CPF, indefinidamente.
- Antes do FIX-217 essas mensagens caíam no agente, que podia explicar OU chamar `suggest_handoff`.
- Assimetria com o padrão que o próprio comentário diz espelhar: `contract-capture` tem outcome
  `cancel` (bail-out); `identify-capture` **não tem**.
- O caminho `ask-cpf` manda o prompt direto (não via `fireGate`/`bumpGateAttempt`), então a
  escalada de cobrança do FIX-211 (`gateAttempts.identify`) é **bypassada** — sem teto de tentativas.

Evidência: `identify-capture.ts:141` (retorna `ask-cpf` p/ qualquer não-CPF), `processor.ts:114-118`
(reemite `IDENTIFY_WHATSAPP_PROMPT` e `return`), `processor.ts:91` (back-intent checado antes).

## Esperado × Atual
- **Esperado:** o usuário nunca fica preso — pode pedir explicação ("por que CPF?"), pedir humano
  (handoff) ou cancelar, mantendo a invariante de nunca buscar sem identidade.
- **Atual:** só "voltar" escapa; todo o resto reemite o pedido de CPF sem fim.

## ⚠️ Decisão de produto PENDENTE-KAIRO (não é fix cego)
O comportamento exato do escape é **decisão de produto/UX** (é o oposto do bug que o FIX-217
resolveu — não pode reabrir o "narra busca sem CPF"). Opções a decidir:
1. Detectar intenção de **handoff/cancelamento** no ramo `ask-cpf` e rotear (suggest_handoff /
   cancelar a jornada), mantendo a trava dura pro resto (skip/jailbreak).
2. Reemitir o pedido de CPF **com o gancho do "por quê"** + opção de atendente após N tentativas
   (reengatar na escalada FIX-211).
3. Manter como está (trava dura total) — aceitar que só "voltar" escapa.

A invariante crítica (nunca `search_groups` sem identidade) é garantida à parte pela
`tool-policy.ts`, então permitir handoff/explicação NÃO reabre o furo de segurança — só evita a trava.

## Regressão exigida (quando promovido)
Teste que, no gate identify (WhatsApp), "quero falar com atendente"/"cancelar" NÃO reemite o CPF
em loop (roteia handoff/cancelamento) e mesmo assim `search_groups` nunca dispara sem identidade.
