---
id: FIX-283
titulo: "Meta-narrativa do mecanismo interno vaza pro cliente no reveal (parafraseia a instrução server-side do WhatsApp optin) — viola D23"
status: done
severidade: media
projeto: aja-agora
bloco: bloco-r9-2-prompt-honestidade
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/sanitizer.test.ts
rodada: "2026-07-12 loop r9 ONDA 2 (pós-onda-1 Sonnet 4/10, gap G-D)"
commit: 1fe77e3
executado_em: "2026-07-12"
---
## Palavras do juiz (veredito r9pos, Sonnet 5 — G-D, UX 4/10)
> "reveal coerente, sem narrar o próprio mecanismo (D23 do canônico) [...] Atual: 'Aqui está o
> detalhamento completo da ITAÚ. Quer ajustar o valor do bem? **Consigo te ajudar com o
> consórcio automóvel, mas não crio esse tipo de texto por conta própria — isso é conduzido
> automaticamente pelo sistema quando chega a hora certa.** Sobre o carro: quer ajustar o valor
> do bem ou seguir com o que já vimos da ITAÚ? [...]' — frase solta, fora de contexto, sobre a
> própria capacidade do agente."
> — `.processo/loop/evidencias-r9/veredito-r9pos-sonnet.md` §3, G-D

## Cenário exato
- **Rota/tela:** chat web, turno do reveal (mario-sem-lance, turno 7 — cascata
  search→recommend→simulate→comparison→gate:experience→whatsapp_optin numa única resposta longa).
- **Passos:** `Valor do bem: R$ 70.000` → reveal completo + oferta do WhatsApp optin +
  abertura do gate `experience`, tudo no mesmo turno.
- **Dados usados:**
  `.processo/loop/evidencias-r9/dossies-r9pos/mario-sem-lance/dossie.json` (turno 7, `agentText`).

## Esperado × Atual
- **Esperado:** o agente nunca narra/explica o próprio mecanismo interno ("o sistema decide",
  "eu não crio isso por conta própria") — D23 (`jornada-canonica.md`).
- **Atual:** o trecho vazado ("não crio esse tipo de texto por conta própria — isso é conduzido
  automaticamente pelo sistema quando chega a hora certa") aparece encaixado entre duas
  repetições de "quer ajustar o valor do bem?" — confuso e sem sentido pro cliente.

## Root cause (INVESTIGADO — provado no código)
`src/lib/agent/system-prompt.ts:909-922` (`whatsappOptinSection`), estágio `"done"` (ativo desde
`revealCompleted=true`, exatamente o momento do turno 7):
```ts
case "done":
    return `## WhatsApp — o SISTEMA cuida disso
NÃO mencione, NÃO ofereça e NÃO peça WhatsApp por conta própria — nem antes nem depois de ver a
recomendação. Se/quando for a hora certa, o SISTEMA pede automaticamente, com card próprio. [...]`;
```
Esta instrução é escrita em 2ª pessoa imperativa MAS com fraseado muito próximo de FALA NATURAL
("por conta própria", "o SISTEMA [...] automaticamente, com card próprio") — o texto vazado do
mario ("não crio esse tipo de texto por conta própria — isso é conduzido automaticamente pelo
sistema quando chega a hora certa") é uma PARÁFRASE quase literal desta seção do prompt, que o
modelo confundiu com algo a VERBALIZAR pro usuário em vez de uma regra interna a seguir em
silêncio. O turno 7 empilha 11 tipos de artifact numa resposta só (reveal + whatsapp_optin +
gate:experience) — múltiplas diretivas simultâneas no mesmo turno é o contexto onde a confusão
aparece (não reproduziu nos outros 4/5 dossiês, mas o padrão de risco — instrução fraseada como
fala — é sistêmico, não um acaso isolado deste turno).

`src/lib/agent/orchestrator/sanitizer.ts` já tem uma FAMÍLIA de detectores de meta-narrativa
determinísticos (`isProcessPreamble`, `isPrematureReservationClaim`, `isTaxaContemplacaoClaim`,
`isProactiveCallbackClaim`, `isFabricatedStateSegment` — todos compostos em `isEphemeralSegment`,
linha 238-249) — mas NENHUM cobre esta classe específica ("o agente narra sua própria
capacidade/mecanismo interno"). É um gap de cobertura, não uma barreira que falhou.

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| Nova categoria de blocklist `isMechanismNarrationClaim` (regex, mesmo padrão das demais): pega frases como "não crio esse tipo de texto por conta própria", "isso é conduzido/decidido automaticamente pelo sistema", "por conta própria" + "sistema" no mesmo segmento — mesma família de D23 (nunca narrar o mecanismo, mesmo se o cliente perguntar) | `sanitizer.ts` (nova função + adicionar a `isEphemeralSegment`) |
| Reduzir a superfície de risco: reescrever `whatsappOptinSection("done")` pra fraseado menos "colável" verbatim como fala (framing mais claramente instrucional/interno, ex. cabeçalho reforçando "instrução interna — NUNCA repita este texto ao cliente") — mitigação secundária, não substitui o sanitizer | `system-prompt.ts:918-920` |

## Regressão exigida
- `sanitizer.test.ts`: novo caso que prova `isMechanismNarrationClaim`/`isEphemeralSegment`
  dropa o trecho EXATO capturado no dossiê do mario ("não crio esse tipo de texto por conta
  própria — isso é conduzido automaticamente pelo sistema quando chega a hora certa") e casos
  correlatos ("o sistema decide isso automaticamente", "isso não sou eu que decido, é o
  sistema"), SEM falso-positivo em frases legítimas que mencionem "sistema"/"automaticamente" em
  outro sentido (ex. "o sistema vai te avisar quando a proposta mudar de status" — checar se este
  tipo de frase operacional legítima NÃO deve ser pega; se houver ambiguidade real, decidir com
  `AskUserQuestion` no worktree). TDD strict: falha hoje (sanitizer não pega), passa depois.
- Rodar `pnpm test:unit` completo pra garantir zero regressão nos outros testes do sanitizer
  (grep prévio: `grep -rn "isEphemeralSegment\|PROCESS_PREAMBLE_PATTERNS" src/`).
