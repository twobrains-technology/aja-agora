---
id: FIX-350
titulo: "P1 — o fallback enlatado ainda dispara (1/8) e a evasão a administradora inexistente é inconsistente (3/8)"
status: done
bloco: bloco-g-consent-wa-fallback
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/system-prompt.fix-350-tools-server-side.test.ts
  - src/lib/agent/system-prompt.behavior-guards.test.ts
  - src/lib/agent/orchestrator/system-context.ts
  - src/lib/agent/orchestrator/system-context.fix-350b-administradora-inexistente.test.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/sanitizer.test.ts
  - src/lib/agent/orchestrator/index.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 4
---

# FIX-350 — o último resquício do fallback + evasão inconsistente

## a) Fallback enlatado (1/8, agora em `auto-whatsapp`)

### Root cause PROVADO (sem precisar de log ao vivo — cruzamento de código)

`tool-policy.ts` (`allowedTools`) **NUNCA** inclui `present_decision_prompt`, `present_topic_picker`
nem `present_whatsapp_optin` em NENHUMA fase — as três viraram emissão 100% SERVER-SIDE havia
rodadas (FIX-253/FIX-309/FIX-280; comentário do próprio arquivo: *"a tool NUNCA entra em
allowedTools em nenhuma fase"*). Mas `system-prompt.ts` (o texto que o modelo lê) nunca foi
atualizado pra acompanhar essas 3 remoções — ainda instruía, com **"REGRA DURA"**, que o modelo
CHAMASSE as três:

- `### Card de decisão "Esse plano faz sentido?" (present_decision_prompt)` — *"você PODE chamar
  present_decision_prompt UMA vez..."*, gated pra só entrar no prompt na fase `closing` (ou seja,
  exatamente quando `decisionDispatched` JÁ é true e o card JÁ apareceu — instrução sempre
  retroativamente errada).
- `### Atalhos com topicos curtos — use present_topic_picker` — REGRA DURA mandando NUNCA prometer
  atalhos sem chamar a tool (empurrando a chamada ainda mais).
- Lista de "6 tools idempotentes" citando `present_topic_picker`/`present_whatsapp_optin` como algo
  que o modelo chama e não deve repetir.

Se o modelo seguir a instrução (ela é explícita e enfática), a chamada bate em `NoSuchToolError`
(tool fora do toolset da fase) — o runner (`index.ts`, branch `tool-error-recovered`) suprime toda
a narração do turno e emite `buildToolErrorRecoveryFallback` (`directives.ts:452`). Duas camadas
dizendo coisas contraditórias é exatamente o anti-padrão do projeto ("quando o código assume um
invariante, remova a regra-no-prompt correspondente — não deixe as duas").

**Precedente confirmando o mecanismo:** o FIX-343 (bloco-e, rodada 2) já tinha provado e corrigido a
MESMA classe de bug nos sub-turnos SERVER-DRIVEN (`dispatchDecisionCascade`/reco-consent-accepted/
whatsapp-optin directive) via `forceToolChoice: "none"`. O resíduo desta rodada (`auto-whatsapp`
t21, "usuário confirma 'sim' a um plano já detalhado") é um TURNO DE USUÁRIO genuíno — não um dos
4 sub-turnos que o FIX-343 já blindou — e a causa é o texto do PROMPT ainda empurrando o modelo a
tentar `present_decision_prompt` nesse ponto.

### Correção aplicada

`system-prompt.ts`: removida toda instrução que manda/permite o modelo CHAMAR
`present_decision_prompt`/`present_topic_picker`/`present_whatsapp_optin` — reescritas pra descrever
que o SISTEMA dispara essas 3 automaticamente (o modelo só reage). A lista de "tools idempotentes"
caiu de 6 pra 4 (só as que o modelo ainda chama de fato: `save_contact_name`,
`save_contact_whatsapp`, `present_value_picker`, `present_lead_form`).

⚠️ **Invariante que não quebrou:** `present_contract_form` continua sendo chamada pelo modelo
normalmente (é uma tool real do toolset de `closing`) — só as 3 que saíram do toolset em TODA fase
foram limpas do prompt.

### Regressão

- `system-prompt.fix-350-tools-server-side.test.ts`: pras 4 fases (`qualify`/`reveal`/`closing`/
  `terminal`) e pro `SPECIALIST_BASE_PROMPT` cru, nenhuma instrução manda o modelo chamar as 3
  tools; a lista de idempotentes não as cita mais.
- `system-prompt.behavior-guards.test.ts` (BUG-TOPIC-PICKER-VARIANTS/BUG-TOOL-DUPLICATION):
  atualizados pra verificar a REGRA DURA de "nunca prometa UI que você não controla" sem mais amarrar a
  `present_topic_picker` como tool chamável, e a lista de idempotentes agora com 4 (não 6).
- Suite completa `system-prompt*` (187 testes) e `pnpm test:unit` (389 arquivos/3571 testes) verdes.

## b) Evasão inconsistente à administradora inexistente (3/8)

Quando o usuário pede "simula a Bradesco" (que não existe nas ofertas), o agente às vezes lista as
reais (ótimo), às vezes **desconversa** ("Ou prefere ver todas lado a lado?") e às vezes **promete e
não cumpre**. O guard (`isHallucinatedAdministradoraClaim`, FIX-342/345) já impede a MENTIRA — mas
ninguém ensinava o agente a **responder bem**. Isso é CONVERSA, e conversa é do modelo: o servidor
dá o FATO no contexto e deixa o modelo redigir.

### Correção aplicada

- `sanitizer.ts` ganha `findUnavailableAdministradoraMention(text, shownAdministradoras)` —
  extraída da MESMA lista fechada + normalização de acento que `isHallucinatedAdministradoraClaim`
  já usava (refatorado pra reusá-la, sem duplicar a lógica), devolvendo QUAL administradora de
  mercado foi citada (pra virar o fato injetado), não só um booleano.
- `system-context.ts` ganha `unavailableAdministradoraFacts` (mesmo padrão de `exactnessFacts`/
  `identityAlreadyCollected`): quando presente, injeta *"Ele pediu pra ver a X — ela NÃO existe
  entre as ofertas reais desta busca. As reais são: Y, Z. [...] NUNCA invente [...], NUNCA prometa
  simulá-la [...], e NUNCA desconverse [...]"* — o modelo redige a resposta com essas palavras.
- `index.ts`: computa o fato ANTES do turno do modelo (mesmo ponto de `exactnessFacts`) —
  só quando `!mentionedOffer` (o texto NÃO resolveu pra uma oferta real já exibida,
  `resolveOfferMentionForConversation`) e `meta.revealCompleted === true` (há ofertas reais pra
  listar). A lista de administradoras exibidas vem de `listShownOffersForConversation` (mesma fonte
  já usada pelo fallback-repeat, nesta mesma função).

### Regressão

- `sanitizer.test.ts` (describe "FIX-350(b)"): `findUnavailableAdministradoraMention` devolve o
  nome de mercado pedido quando fora das ofertas reais, `null` quando a citação já é uma oferta real
  (continência FIX-345), `null` sem contexto (compat retroativa) e `null` pra texto sem
  administradora nenhuma.
- `system-context.fix-350b-administradora-inexistente.test.ts`: sem o fato, nada muda
  (comportamento anterior intacto); com o fato, injeta o FATO real (não frase scriptada), proíbe
  inventar/prometer, instrui redirecionar pra lista real, e convive com os outros blocos
  (`knownName`) sem sobrescrever.

## Regressão exigida (do arquivo original)

- Integração: pedir administradora inexistente → o agente responde citando as REAIS, sem inventar e
  sem desconversar. **Coberto no nível de unidade (system-context.ts é puro)** — o comportamento
  fim-a-fim (LLM real redigindo a partir do fato) depende de Camada 3 (eval), fora do escopo
  determinístico deste bloco.
- Integração: o texto de `buildToolErrorRecoveryFallback` não aparece em nenhuma jornada saudável.
  **Root cause fechada em `system-prompt.ts`** (item a) — o caminho que mais gerava esse fallback
  residual (o modelo tentando tools removidas do toolset) está bloqueado na fonte.
