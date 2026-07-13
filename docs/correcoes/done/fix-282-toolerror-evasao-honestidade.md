---
id: FIX-282
titulo: "Recovery de tool-error devolve fallback genérico 'opções continuam valendo' mesmo quando a pergunta do usuário é sobre exatidão/critério da carta — descarta a resposta honesta"
status: done
severidade: alta
projeto: aja-agora
bloco: bloco-r9-2-prompt-honestidade
arquivos:
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/directives.test.ts
  - src/lib/agent/orchestrator/index.fix-282-honestidade-toolerror.integration.test.ts
rodada: "2026-07-12 loop r9 ONDA 2 (pós-onda-1 Sonnet 4/10, gap G-B)"
commit: e758a50
executado_em: "2026-07-12"
---
## Palavras do juiz (veredito r9pos, Sonnet 5 — G-B/I2, UX 4/10)
> "o usuário pergunta direto e depois insiste [...] 'Peraí, essa carta que você recomendou é de
> 120 mil como pedi? Por que essa e não outra?' [...] o agente não responde SIM nem NÃO à
> pergunta [...] Turno 9 [...] despeja a lista bruta das 16 cartas do sweep [...] nunca conecta
> o dado ao 'por quê' pedido [...] nem falso, nem honesto — um terceiro padrão de falha
> (stonewall/evasão a uma pergunta legítima do cliente, 2 vezes seguidas)."
> — `.processo/loop/evidencias-r9/veredito-r9pos-sonnet.md` §2 (sonda I2) + §3, G-B

**Nota:** a hipótese original da rodada (intent tipo `question_about_recommendation` em
`system-prompt.ts`/`turn-analyzer.ts`) foi INVESTIGADA e REFUTADA pela evidência — o mecanismo
real é outro (abaixo). Regra "não crave o que não verificou": segue a causa provada.

## Cenário exato
- **Rota/tela:** chat web, pós-reveal (fase `reveal`, `revealCompleted=true`,
  `decisionDispatched=false`), turnos 8-9 do dossiê `probe-i2-justificativa`.
- **Passos:** reveal (ITAÚ, `creditValue`=124.599, pedido 120.000, `rawCreditValue`=120.000) →
  usuário pergunta se bate + por quê (turno 8) → insiste pedindo o critério (turno 9).
- **Dados usados:**
  `.processo/loop/evidencias-r9/dossies-r9pos/probe-i2-justificativa/dossie.json` (turnos 7-9).

## Esperado × Atual
- **Esperado:** responder SIM/NÃO à exatidão (compara `rawCreditValue`=120.000 ×
  `creditValue`=124.599, diretiva já existe pra isso — `system-prompt.ts:598-609`, FIX-277) e
  explicar o critério de escolha (score/ranking) quando o usuário pressiona o "por quê".
- **Atual:** turno 8 → *"Rafael, as opções que já apareceram aqui pra você continuam valendo. Me
  diz o nome da administradora ou o valor que você quer olhar de novo que eu detalho certinho pra
  você."* (texto idêntico, verbatim, a `buildToolErrorRecoveryFallback`). Turno 9 → despeja as 16
  cartas cruas do sweep, termina em *"Me diz qual delas você quer olhar de novo."* (verbatim,
  `buildToolErrorRecoveryFallbackRepeat`).

## Root cause (INVESTIGADO — provado no código)
O dossiê mostra `artifactTypes: ['tool:search_groups']` nos turnos 8 e 9 — o modelo TENTOU
chamar `search_groups` pra "conferir"/responder com precisão. Mas na fase `reveal`
(`meta.revealCompleted=true`, `decisionDispatched=false`), `search_groups`/`recommend_groups`
estão FORA do toolset por padrão (`tool-policy.ts:143-180`, `DISCOVERY_AND_REVEAL_CARDS` só entra
se `revealValueTargetChanged(meta)` — falso aqui, o usuário não pediu faixa nova) — a chamada
vira `tool-error`.

`src/lib/agent/orchestrator/index.ts:475-500` intercepta QUALQUER `toolErrorThisTurn` /
`toolCallCapExceededThisTurn` e SUBSTITUI TODA a narração do turno (mesmo que o modelo já
estivesse formulando uma resposta honesta usando a diretiva FIX-277) por um fallback genérico e
CEGO ao conteúdo da pergunta:
```ts
if (result.toolErrorThisTurn || result.toolCallCapExceededThisTurn) {
    let fallback: string;
    if (mentionedOffer) {
        fallback = buildToolErrorRecoveryResolvedFallback({ name: knownName, offer: mentionedOffer });
    } else {
        const generic = buildToolErrorRecoveryFallback({ name: knownName });
        // ...troca pra buildToolErrorRecoveryFallbackRepeat se repetir...
    }
```
`mentionedOffer` (resolução por nome de administradora/valor) não capta "essa carta que você
recomendou" (não cita administradora nem valor novo) → cai no ramo genérico nos DOIS turnos.
`buildToolErrorRecoveryFallback`/`buildToolErrorRecoveryFallbackRepeat`
(`directives.ts:417-424`,`:469+`) foram desenhadas pra UM cenário (FIX-262/266: negar oferta real
por tool-error/cap em geral) — não distinguem "usuário quer ver mais opções" (I1, uso correto) de
"usuário questiona a exatidão/critério da oferta JÁ na tela" (I2, uso incorreto: a pergunta tem
resposta factual pronta — `rawCreditValue`/`creditValue` do `meta.recommendedOffer` — e a diretiva
FIX-277 já cobre a honestidade, mas nunca chega a rodar porque este fallback a substitui ANTES).

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| Novo classificador determinístico (regex, mesmo padrão dos `isXClaim` de `sanitizer.ts`) que reconhece pergunta de EXATIDÃO/CRITÉRIO sobre a oferta já mostrada (\"bate\"/\"exato\"/\"por que essa\"/\"que critério\" + contexto de oferta já na tela) | `directives.ts` (nova função, ex. `isExactnessOrCriteriaQuestion`) |
| No ramo `toolErrorThisTurn \|\| toolCallCapExceededThisTurn` de `index.ts`, ANTES de cair no fallback genérico: se o texto do usuário casar com o classificador acima E houver `meta.recommendedOffer` com `creditValue`, construir uma resposta FACTUAL determinística comparando `rawCreditValue` (mesma âncora do FIX-281: `meta.qualifyAnswers.creditClampedFrom ?? creditMax`) × `creditValue`, nos moldes do texto já validado em `system-prompt.ts:598-609` (FIX-277) | `index.ts:475-500` (novo branch antes do genérico) + nova função builder em `directives.ts` |
| DECISÃO DE DESIGN (brainstorming no worktree, `AskUserQuestion`): a parte do "por quê essa e não outra" (critério de score) HOJE não tem dado determinístico disponível em `meta` (`meta.recommendedOffer` não persiste `score`/`scoreBreakdown` — só `administradora/category/creditValue/termMonths/monthlyPayment/groupId`, `personas.ts:163-174`). Opção A (mínima): responder honestamente só a parte de EXATIDÃO (números) + uma frase genérica-mas-honesta sobre critério combinado (prazo/parcela/contemplação), sem inventar um score que não existe em memória. Opção B (mais completa): persistir `score`/`scoreBreakdown` em `meta.recommendedOffer` no momento do reveal (`runner.ts`, mesmo ponto que hoje grava `creditValue/termMonths/monthlyPayment`) e citar o critério real. Recomendação: Opção A agora (menor blast radius, resolve o P1 imediato), Opção B como achado pra rodada seguinte se o Kairo quiser o critério explicado com números reais | decisão do executor via `AskUserQuestion`, registrar em `docs/decisoes/blocos/` |

## Regressão exigida
- Novo `src/lib/agent/orchestrator/index.fix-282-honestidade-toolerror.integration.test.ts`
  (mesmo padrão de `index.fix-266-recuperacao-resolve.integration.test.ts`): reproduz o cenário
  EXATO do probe-i2 — reveal com `rawCreditValue`≠`creditValue`, usuário pergunta "é de X mil
  como pedi? por que essa e não outra?", modelo dispara tool-error via `search_groups` fora de
  fase — a resposta final NÃO pode ser o texto verbatim de `buildToolErrorRecoveryFallback`/
  `buildToolErrorRecoveryFallbackRepeat`; TEM que conter a comparação real dos dois valores. TDD
  strict: o teste falha hoje (recebe o fallback genérico), passa depois do fix.
- `directives.test.ts`: casos unitários do novo classificador (`isExactnessOrCriteriaQuestion` ou
  nome equivalente) — casa "é de X mil como pedi?", "por que essa e não outra?", "tinha carta
  exata? me explica o critério"; NÃO casa perguntas neutras tipo "quero ver mais opções".
- Rodar `pnpm test:unit` e confirmar que I1 (`wants_more_options` genuíno, "quero ver mais
  opções") CONTINUA recebendo o fallback antigo (não regredir o comportamento correto já
  confirmado pelo veredito).
