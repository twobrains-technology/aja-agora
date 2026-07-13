---
id: FIX-308
titulo: "Acopla avanço da cascata ao consentimento REAL (recoConsentAnswered), não só ao dispatch"
status: done
bloco: bloco-r10-4-reco-consent-hero
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/index.ts, src/lib/agent/qualify-state.ts]
rodada: 2026-07-13 (loop-de-goal r10, onda 4, bloco r10-4-reco-consent-hero — investigação de causa-raiz da Etapa A)
commit: 052ba67..a9ff9ff9
executado_em: 2026-07-13
---
## Palavras do operador
> Investigação de causa-raiz: hero (`recommendation_card`) aparece no dossiê real da Madalena, mas
> **6 turnos atrasado** (turno 18 em vez de ~12) — coincidindo com o que deveria ser o turno de
> scarcity/decision — e `contract_form`/`whatsapp_optin` já dispararam ANTES dele (turno 12).

## Cenário exato
- **Rota/tela:** pós-reveal, gate `reco-consent` ("Posso te mostrar a opção que eu recomendo?").
- **Dados usados:** `madalena-junta-v2/dossie.json` — turno 10 pergunta reco-consent (texto),
  turno 12 usuário responde "Pode mostrar" (aceito conceitualmente, mas hero NÃO libera), turno 18
  usuário diz "quero" e SÓ AÍ o hero libera.

## Esperado × Atual
- **Esperado:** consentimento reconhecido na primeira resposta afirmativa clara ("pode mostrar" É
  uma resposta afirmativa) — hero libera logo em seguida, ANTES do fecho (`contract_form`) avançar.
- **Atual:** `nextGate()` avança em `recoConsentDispatched` (a PERGUNTA foi feita), mas o hero só
  sai quando `recoConsentAnswered` vira `true` — e isso só acontece via `detectYesNoText()`
  (`index.ts:72-73`), cujo regex de marcadores de sim NÃO reconhece "pode mostrar" (só bateu em
  "quero", 6 turnos depois). Nesse intervalo, a cascata JÁ avançou pra timeframe/lance/decisão e o
  fecho (`contract_form`/`whatsapp_optin`) já disparou ANTES do hero aparecer.

## Root cause (INVESTIGADO — confirmado no dossiê real + código)
- `index.ts:276-312`: hero só é liberado com `recoConsentAnswered===true`.
- `index.ts:72-73` (`detectYesNoText`, `YES_TEXT_MARKERS`): regex não cobre "pode mostrar"/"pode"/
  "mostra".
- `qualify-state.ts:258`: `nextGate()` avança a cascata assim que `recoConsentDispatched` fica
  `true` (pergunta feita), SEM esperar `recoConsentAnswered` — desacoplamento entre "perguntei" e
  "recebi resposta clara", permitindo o resto do funil (incluindo o fecho) avançar por cima.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| **Opção recomendada:** `nextGate()` NÃO avança a cascata enquanto `recoConsentAnswered` for falso (acopla dispatch↔answer — a cerimônia não pode marchar sem o consentimento que ela existe pra colher) | `qualify-state.ts:258` |
| Robustecer `YES_TEXT_MARKERS` pra incluir "pode/pode mostrar/mostra/manda ver" (variantes comuns de aceite a um convite, não só afirmação genérica) | `index.ts:72-73` |
| Considerar também aceitar `intent==="ready_to_proceed"` como sinal de consentimento (já é um intent que a análise classifica) | `index.ts` |

## Regressão exigida
- Teste de integração reproduzindo o cassette real: reco-consent perguntado → "Pode mostrar" →
  hero libera NO PRÓXIMO turno (não 6 turnos depois).
- Teste: cascata NÃO avança pra timeframe/lance/decisão enquanto reco-consent não foi respondido
  com clareza (nem positiva nem negativamente reconhecida).
- Teste: `contract_form`/`whatsapp_optin` nunca disparam antes do hero ter sido liberado.
