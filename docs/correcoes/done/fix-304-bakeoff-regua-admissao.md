---
id: FIX-304
titulo: "Régua de admissão de modelo (bakeoff como gate) + casca determinística por-gateway"
status: done
bloco: bloco-r10-2-bakeoff-regua
severidade: media
projeto: aja-agora
arquivos: [scripts/bakeoff.sh, src/lib/agent/orchestrator/sanitizer.ts, src/lib/llm/gateway-openai.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 2, bloco r10-2-bakeoff-regua — sequencial, depende dos fixes de código da onda 1)
executado_em: 2026-07-13
---
## Palavras do operador
> "aqui a gente está usando o modelo Qwen 3.5 Fast, é um modelo bem barato... independente do
> comportamento da conversa está totalmente ruim" — Kairo, 2026-07-12.

## Cenário exato
- **Rota/tela:** processo de decisão de modelo (não é bug de produto rodando em prod).
- **Passos:** re-rodar `scripts/bakeoff.sh` com `AI_MODEL` apontando pro Qwen, pós onda 1 (funil
  reordenado + invariantes de humanização em código), e comparar com o baseline anterior.
- **Dados usados:** `.bakeoff/qwen-jornada.log` (2026-07-05): `fluxoScore=0.774` (alvo ≥0.85), 4
  falhas/31 testes.

## Esperado × Atual
- **Esperado:** nenhuma troca de `AI_MODEL` em dev/prod acontece sem o bakeoff bater a régua — e
  os invariantes que a onda 1 moveu pra código (1 frase interrogativa, reveal server-forced,
  topic-picker enum canônico) deveriam reduzir a distância entre modelo barato e modelo de prod.
- **Atual:** não há gate formal de admissão — a régua existe (`bakeoff.sh`) mas não é
  obrigatória antes de qualquer troca futura de `AI_MODEL`. P10 (frases coladas/emoji/
  capitalização no gateway OpenAI-compat) nunca foi confirmado por turn-trace.

## Root cause (INVESTIGADO)
- `.bakeoff/qwen-jornada.log`: reprovação mecânica já registrada, é fato, não hipótese.
- `gateway-openai.ts`: caminho de streaming diferente do nativo Anthropic — chunking de frases
  pode divergir (hipótese original P10).

## Execução (2026-07-13)

### 1. Capitalização/emoji — JÁ RESOLVIDO pelo FIX-299 (onda 1)

Confirmado por leitura direta do código antes de qualquer reimplementação:
- `src/lib/agent/orchestrator/sanitizer.ts:276-286` — `stripEmoji()` + `EMOJI_PATTERN` (blocos
  Unicode de emoticons/símbolos/transporte/dingbats/bandeiras/seletor de variação/ZWJ), aplicado
  em `stripProcessPreamble` e em `EphemeralTextFilter.filterComplete`/`releaseHeldQuestion`.
- `src/lib/leads/contact-capture.ts:75-89` — `capitalizeName()` (Title Case determinístico,
  respeita partículas pt-BR "de/da/do/das/dos", capitaliza cada lado de nome hifenizado),
  aplicado em `saveContactName` (linha 116) antes de persistir `contactName`.
- Testes de regressão já existem e cobrem os dois: `sanitizer.test.ts` (emoji) e
  `contact-capture.test.ts:167-192` (FIX-299 — capitalizeName, 6 casos incluindo minúsculo,
  maiúsculo, misto, composto com partícula, hifenizado, já-correto).

**Nada foi reimplementado.** Este item do fix-304 era só verificação, conforme o `_bloco.md`
já sinalizava como risco de overlap com a onda 1.

### 2. Bakeoff re-rodado — REGRESSÃO, não melhora

Ambiente: DB do workspace provisionado via `bootstrap-workspace.sh --db-only` (clone do template
+ migrations aplicadas), túnel SSM pro gateway LiteLLM shared (`scripts/tunnel-litellm.sh` do
repo `twobrains-aws-platform`) porque `litellm-srv.tb.local` só resolve dentro da VPC — usando a
virtual key de dev do próprio projeto (`tb/dev/aja-agora/env` → `LITELLM_API_KEY`), que já tinha
`qwen3.6-flash` na allowlist. Comando: `AI_MODEL=qwen3.6-flash AI_MODEL_EVAL=claude-haiku-4-5
pnpm vitest run --config vitest.eval.config.ts tests/eval/jornada-aja-agora.eval.test.ts`.

**Nota de infraestrutura:** as 2 primeiras tentativas (via `scripts/bakeoff.sh` em background)
travaram indefinidamente numa chamada de rede pendurada através do túnel SSM (uma depois de ~2min
de trabalho real, outra depois de ~40min) — sintoma consistente com o fetch nativo do Node sem
timeout, combinado com uma sessão SSM que morre silenciosamente sob streaming longo. A 3ª
tentativa, rodada em foreground (sem o wrapper `bakeoff.sh`, deixando o timeout do próprio
executor matar o processo se necessário) e com o túnel recriado do zero, completou em 293s.

| | Baseline (2026-07-05, pré onda 1) | Novo (2026-07-13, pós onda 1) |
|---|---|---|
| `fluxoScore` | 0.774 | **0.68** (pior) |
| Testes falhos | 4/31 | **12/31** (pior) |
| Duração | 236s | 293s |
| Gates observados | …→lance→lance-value→lance-value→lance-embutido→**simulator-offer**→simulator-offer | …→lance→timeframe→lance-value→lance-embutido→**timeframe**→timeframe→timeframe→timeframe |

**A expectativa registrada no estudo original (S7: "a nota deve subir porque o funil deixa de
depender de obediência ao prompt") não se confirmou — o score piorou.** Causa observada nos logs
(`.bakeoff/qwen-jornada-pos-r10-onda1.log`, preservado no worktree, `.gitignore`d):

1. **BUG-REVEAL-LOOP reapareceu.** O funil pós-onda-1 tem mais gates (`reco-consent` novo,
   `timeframe` repetido) e um toolset mais estrito por fase. O Qwen tentou chamar
   `present_decision_prompt` e `present_contract_form` fora da fase corrente (`reveal`) —
   `tool-policy-violation` + `tool_error: "Model tried to call unavailable tool"` — disparando o
   fallback determinístico repetidamente ("as opções que já apareceram aqui pra você continuam
   valendo…") sem nunca avançar. O juiz classificou isso como "Loop de respostas sem avanço […]
   travando o fluxo do passo 4 ao 5".
2. **Desvio para humano no fechamento**: "agente delegou para 'especialista em cadastros te
   chama' em vez de conduzir self-service (FIX-34)" — regressão nova, não presente no baseline.
3. Gate `simulator-offer` nunca disparou nesta execução (ficou preso em `timeframe` 4x seguidas).

**Leitura:** o tool-calling fraco do Qwen (já sinalizado como risco nos "Riscos e gaps honestos"
do estudo original: *"tool-calling fraco pode aumentar tool-error/turnos abortados"*) piora com
MAIS fases/gates no funil, não melhora — cada fase nova é mais uma superfície onde o modelo pode
tentar uma tool fora de escopo. Os invariantes movidos pra código (FIX-296…301) resolveram os
sintomas que atacavam (1 pergunta/turno, reveal em dois tempos, topic-picker canônico), mas
introduziram gates extras que o Qwen não navega de forma confiável.

**Ressalva metodológica**: `n=1` execução em cada lado — o eval não é determinístico (LLM real
em ambos os braços) e uma única amostra tem ruído. Mas a natureza do achado (erro de
tool-calling estrutural novo, não uma variação de nota de humanização) é qualitativamente
diferente de ruído estatístico — é presença/ausência de um sintoma novo, não uma flutuação de
score contínuo.

### 3. P10 (chunking gateway-openai.ts) — INCONCLUSIVO, com pista refinada

Não consegui confirmar a hipótese original ("gateway OpenAI-compat entrega os blocos de forma
diferente do Anthropic nativo") por `turn-trace`: o módulo `src/lib/telemetry/turn-trace.ts`
**agrega contadores por turno** (tools chamadas, artifacts, chars totais) — não grava os deltas
brutos de texto nem o `blockId` de cada chunk do stream. Os testes de eval (`jornada-aja-agora.
eval.test.ts`) também não exercitam turn-trace (chamam `runTurn` direto, sem passar pelo
route.ts/adapter.ts que instrumentam). Não havia orçamento de tempo neste bloco pra instrumentar
isso do zero (seria mudança de código nova, fora do "só confirmar" pedido).

**O que a transcrição real desta execução mostra** (evidência textual, não turn-trace formal):
```
boa, 55 mil então.encontramos 3 boas opções para o seu perfil. agora vamos te recomendar a mais adequada.
```
"então." colado a "encontramos" sem espaço — mesma classe de sintoma do P10 original. Análise:

- Se fosse uma fronteira de CONTENT BLOCK real (steps diferentes do multi-tool-call turn, id
  distinto no `fullStream`), o `textBlockSeparator` (`runner.ts:210-220`) insere `\n\n`
  **incondicionalmente** quando o acumulado não termina em espaço — "então." não termina em
  espaço, deveria ter ganho separador. Não ganhou. Isso sugere que a colagem ocorreu **dentro do
  mesmo bloco/delta** (texto contínuo do modelo), não numa fronteira de bloco — ou seja, não é
  necessariamente o "chunking do gateway" da hipótese original.
- O guard existente pra esse padrão (`normalizeGluedSentences`, FIX-189, `sanitizer.ts:468-471`)
  só insere separador quando a frase SEGUINTE começa com **letra MAIÚSCULA**
  (`/(\p{Ll})([.!?])(\p{Lu})/gu`). Só que o estilo de copy real do produto é **majoritariamente
  minúsculo** mesmo no início de frase (todo o transcript desta jornada: "boa, kairo!", "beleza!",
  "show, kairo!" — só nomes próprios como "Kairo"/"ITAÚ" capitalizam) — "encontramos" é minúsculo,
  então o guard nunca dispara pra esse caso, **independente de modelo ou gateway**.

**Conclusão sobre P10: inconclusivo quanto à causa exata** (não confirmei se a origem é
cross-block do transporte OpenAI-compat ou geração crua do modelo sem espaço — precisaria de
turn-trace por-delta, que não existe hoje). **Mas há uma pista mais concreta e acionável que a
hipótese original**: `normalizeGluedSentences` está estruturalmente incompleto pro estilo de
copy real (lowercase-first), o que é verificável e corrigível sem qualquer instrumentação nova —
mas fica **fora deste bloco** por ainda não ter side-by-side confirmando que não há regressão
(ex.: falso-positivo separando "r$ 4.000" — já coberto por outro guard — ou nomes próprios
minúsculos legítimos como continuação de frase). Registrado como dúvida aberta pro próximo fix.

### Sem mudança de código neste bloco

Nenhum fix de código foi implementado: (a) capitalização/emoji já estava coberto (FIX-299); (b) a
regressão do funil (BUG-REVEAL-LOOP, tool-calling fora de fase) está fora do `escopo_arquivos`
deste bloco (`qualify-state.ts`/`tool-policy.ts`, não `sanitizer.ts`/`gateway-openai.ts`) e
precisa de investigação própria; (c) P10 não foi confirmado o suficiente pra propor fix
(instrução explícita do bloco: não propor sem confirmação).

## Correção proposta (o quê × onde) — status final
| O quê | Onde | Status |
|-------|------|--------|
| Re-rodar `scripts/bakeoff.sh` com Qwen pós onda 1 — registrar novo score | `.bakeoff/qwen-jornada-pos-r10-onda1.log` | ✅ feito — score piorou (0.68 vs 0.774) |
| Capitalização determinística do `contactName` | `sanitizer.ts`/`contact-capture.ts` | ✅ já coberto pelo FIX-299, só verificado |
| Investigar chunking de frases no `gateway-openai.ts` via turn-trace | `gateway-openai.ts`, `turn-trace.ts` | ⚠️ inconclusivo — turn-trace não tem granularidade de delta; pista refinada aponta pro guard `normalizeGluedSentences` (não confirmado) |
| Documentar a régua como processo obrigatório | `.done/2026-07-13-bloco-r10-2-bakeoff-regua.md` | ✅ feito |

## Regressão exigida
Não é TDD de código puro — nenhuma mudança de produto foi feita. Evidência de processo: log do
bakeoff re-rodado (`.bakeoff/qwen-jornada-pos-r10-onda1.log`, local ao worktree, `.gitignore`d —
conteúdo relevante reproduzido acima e no `.done/` do bloco).
