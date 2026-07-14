---
id: FIX-343
titulo: "P0 — o fallback enlatado AINDA dispara em 5 dos 8 dossiês (loop de 3× em serviços)"
status: done
bloco: bloco-e-fallback-residual
arquivos:
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/index.fix-343-directive-turn-tool-error-vaza.integration.test.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 2 (juiz Sonnet, 3/10)
---

# FIX-343 — o sintoma-mor ainda está vivo (o FIX-332 não pegou todos os caminhos)

## Cenário (juiz da rodada 2)

O texto enlatado — *"as opções que já apareceram aqui pra você continuam valendo…"* e *"deixa eu
reapresentar as opções"* — **ainda dispara em 5 dos 8 dossiês**, incluindo um **loop de 3× em
`servicos-web` que nunca resolve o pedido do usuário**.

O FIX-332 (rodada 1) liberou `search_groups` pós-reveal, mas o fallback continua sendo acionado
por OUTROS caminhos: `toolErrorThisTurn` e `toolCallCapExceededThisTurn` (`index.ts:797`).

## Root cause PROVADA (não foi corrigido no escuro)

Não foi possível reproduzir com o LLM real (sem stack completa + túnel LiteLLM de pé nesta sessão
— ver `~/.claude/reference/...` sobre VPN/LiteLLM local). A causa foi **provada por leitura de
código + correlação byte-a-byte com o dossiê `moto-web.md` (rodada 2, t15)**, e depois **confirmada
por reprodução determinística** num teste de integração (ver abaixo) que gera o MESMO texto
"Frankenstein" do dossiê real, palavra por palavra.

`dispatchDecisionCascade` (`orchestrator/index.ts`) roda sub-turnos **PURAMENTE NARRATIVOS**
(scarcity, decision/so_parcela) via `runTurn({ isUserTurn: false, ... })` — o directive correspondente
(`buildScarcityDirective`/`buildLanceSoParcelaDirective`/`buildDecisionPromptDirective`) só probe
"NÃO chame NENHUMA tool" em **texto de prompt** (regra-no-prompt, não invariante em código — exatamente
o que o CLAUDE.md do projeto proíbe). Quando o modelo desobedece essa regra e tenta uma tool que foi
removida do toolset (`present_two_paths`/`present_decision_prompt`, server-side-only desde
FIX-246/253), o AI SDK emite `tool-error` (NoSuchToolError) → `runner.ts` descarta TODA a fala do
sub-turno → `index.ts` materializa `buildToolErrorRecoveryFallback` — texto escrito pra responder uma
PERGUNTA de usuário sobre oferta, que não existe nesse ponto (é um sub-turno de transição, sem
pergunta nenhuma no ar). Pior: `dispatchDecisionCascade` **não verifica** o resultado do
`yield* runTurn(...)` interno — ela segue incondicionalmente e cola o card+texto determinístico da
cascata (two_paths/decision_prompt + `TWO_PATHS_FOLLOWUP_TEXT`) logo depois do fallback, produzindo o
texto "Frankenstein" visto no dossiê (`moto-web.md` t15, `auto-whatsapp.md` t12, `moto-whatsapp.md`
t13).

**O MESMO defeito estrutural já tinha sido encontrado e corrigido** — pelo **FIX-319** (rodada 10) —
no caminho IRMÃO: `pipeClosingCeremony` (`src/app/api/chat/route.ts`, usado quando o usuário avança
por CLIQUE), via `forceToolChoice: "none"` (já suportado por `TurnInput`/`runner.ts`/`builder.ts` —
`ToolChoice: "none"` do AI SDK 6 barra qualquer tool-call em nível de API, nunca regra-no-prompt). Só
faltava aplicar o MESMO fix no caminho de TEXTO (`dispatchDecisionCascade`), que é exatamente o
caminho exercido no dossiê `moto-web` (confirmação final por texto livre, não por clique) — a
lição-mãe deste bloco ("blindar um caminho não basta quando o comportamento é montado em outro
lugar") se repetiu dentro do próprio FIX-343.

**Achado adicional (não é este bug):** o texto "reapresentar as opções" em `servicos-web.md`
(t9/t11/t12) é DIFERENTE — não é o fallback determinístico (o texto varia, e vem concatenado com
simulações REAIS bem-sucedidas no mesmo turno, o que é estruturalmente impossível no caminho
`toolErrorThisTurn`, que zera `fullResponse`). É o modelo tentando (e falhando) resolver uma
administradora ALUCINADA ("Estrela") — mesma classe do P0.1 (alucinação de oferta) do bloco-d, fora
do escopo deste fix.

## Correção aplicada

`forceToolChoice: "none"` nos 4 sub-turnos PURAMENTE narrativos de `orchestrator/index.ts` (mesmo
mecanismo já provado pelo FIX-319): os 2 de `dispatchDecisionCascade` (scarcity, decision/so_parcela)
+ o de `reco-consent` aceito (`buildRecoConsentAcceptedDirective`) + o do directive de WhatsApp optin
(`buildWhatsappOptinDirective`) — todos com o mesmo padrão estrutural (card sai server-side,
directive só narra, nenhum tool-call esperado). Convertido o invariante "não chame tool aqui" de
regra-no-prompt pra código (Lei 4) — sem adicionar guard novo, sem texto fixo novo, sem re-buscar a
Bevi.

⚠️ **Invariante que não quebrou:** continua PROIBIDO re-buscar na Bevi pós-reveal (não tocado).

## Regressão

- Integração NOVA (`index.fix-343-directive-turn-tool-error-vaza.integration.test.ts`): confirmação
  por texto no ramo so_parcela reproduz — RED — o mesmo texto "Frankenstein" do dossiê real
  byte-a-byte, e — GREEN, pós-fix — o fallback nunca aparece, a cascata determinística segue intacta.
- Confirmado sem regressão: suite completa de `src/lib/agent/orchestrator/` (704 testes, os únicos 5
  que falham são PRÉ-EXISTENTES — comparados com/sem este diff via `git stash`, mesma falha idêntica
  nos dois — `index.fix-301-clarify-usuario-confuso` e `runner.fix-326-p4-gate-question-collision`,
  fora do escopo deste bloco, não tocados).
- "pedir simula a ITAÚ pós-reveal não produz tool-error" e "fallback nunca repete 2× na mesma
  conversa" já estavam cobertos por FIX-332 (rodada 1) e continuam verdes.
