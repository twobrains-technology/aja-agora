# Bloco r10-2 bakeoff-regua — FIX-304

## Score do bakeoff — antes × depois (destaque)

| | Baseline (2026-07-05, pré onda 1) | Novo (2026-07-13, pós onda 1, `qwen3.6-flash`) |
|---|---|---|
| `fluxoScore` | **0.774** (alvo ≥0.85) | **0.68** — **PIOROU** |
| Testes falhos | 4/31 | **12/31** |
| Gate `simulator-offer` | disparou 2x | **nunca disparou** (preso em `timeframe` x4) |

**A expectativa do estudo original (S7 — "a nota deve subir porque o funil deixa de depender de
obediência ao prompt") NÃO se confirmou.** A onda 1 corrigiu os sintomas que atacava (1 pergunta
por turno, reveal em dois tempos, topic-picker canônico), mas o funil pós-onda-1 tem mais gates
(`reco-consent` novo) e um toolset mais estrito por fase — e o tool-calling fraco do Qwen (já
sinalizado como risco no estudo: "pode aumentar tool-error/turnos abortados") piora com mais
fases, não melhora. Ver o card `docs/correcoes/done/fix-304-bakeoff-regua-admissao.md` pro
detalhe completo (evidência de log, gates observados, análise).

**Decisão de admissão de modelo: Qwen 3.6 Flash continua reprovado na régua** (pior que antes).
Nenhuma troca para Qwen em dev/prod está justificada por este resultado. Candidato barato viável
mais próximo já medido continua sendo o Haiku 4.5 (bake-off anterior: 64/69, ver memória de
projeto `project_aja_bakeoff_haiku_sonnet`).

## Conclusão sobre P10 (chunking gateway-openai.ts): **INCONCLUSIVO**

Não confirmei a hipótese original ("gateway OpenAI-compat entrega os content-blocks de forma
diferente do Anthropic nativo") — `turn-trace.ts` agrega contadores por turno, não grava deltas
brutos nem `blockId` por chunk, e os testes de eval não exercitam turn-trace (chamam `runTurn`
direto). Confirmar exigiria instrumentação nova, fora do "só confirmar" pedido neste bloco.

**Pista real e mais concreta encontrada na transcrição desta execução:** `"então.encontramos"`
colado sem espaço. O `textBlockSeparator` (fronteira real de content-block) insere `\n\n`
incondicionalmente quando o acumulado não termina em espaço — não inseriu, o que sugere que a
colagem NÃO veio de uma fronteira de bloco, mas de texto contínuo do próprio modelo. O guard que
deveria pegar isso (`normalizeGluedSentences`, FIX-189) só dispara quando a frase seguinte começa
com LETRA MAIÚSCULA — mas o estilo de copy real do produto é majoritariamente minúsculo mesmo no
início de frase ("boa, kairo!", "beleza!", "show, kairo!"), então o guard nunca dispara pra esse
caso, **independente de modelo ou gateway**. Registrado como dúvida aberta / pista pro próximo
fix — não implementado aqui por falta de confirmação (regra explícita do bloco).

## Passo 2 (capitalização/emoji) — já resolvido, nada reimplementado

Confirmado por leitura direta: `sanitizer.ts` (`stripEmoji`/`EMOJI_PATTERN`) e
`contact-capture.ts` (`capitalizeName`, aplicado em `saveContactName`) já cobrem os dois
sintomas do card, ambos entregues pelo FIX-299 na onda 1 (bloco r10-1-sanitizer-invariantes,
integrado antes deste bloco começar). Testes de regressão já existentes:
`sanitizer.test.ts` (emoji) e `contact-capture.test.ts:167-192` (capitalização, 6 casos).

## Ambiente / infraestrutura usada

- DB do workspace: `bootstrap-workspace.sh --db-only` (clone do template `aja_agora_template`) +
  `pnpm db:migrate` (schema atualizado com as migrations da onda 1).
- Gateway LiteLLM: `litellm-srv.tb.local` só resolve dentro da VPC — usei
  `scripts/tunnel-litellm.sh` (repo `twobrains-aws-platform`, túnel SSM port-forward pro host EC2
  da task `litellm-shared`) + a virtual key de DEV do próprio projeto
  (`tb/dev/aja-agora/env` → `LITELLM_API_KEY`, já com `qwen3.6-flash` na allowlist).
- **2 travamentos de infra durante a execução**: rodar `scripts/bakeoff.sh` em background travou
  2x numa chamada de rede pendurada através do túnel SSM (fetch nativo sem timeout + sessão SSM
  que morre silenciosamente sob streaming longo) — uma trava após ~2min de trabalho real, outra
  após ~40min. Resolvido rodando o vitest diretamente em foreground (sem o wrapper do
  `bakeoff.sh`), deixando o timeout do próprio executor garantir que o processo não fica preso
  pra sempre, com o túnel recriado do zero antes da tentativa que completou.
- Achado lateral: `qwen3.6-flash` é um modelo com "thinking" (retorna `reasoning_content` — 183
  tokens de raciocínio pra responder "ok" a um prompt trivial) — explica parte da lentidão maior
  vs o baseline (293s vs 236s) e é coerente com o board reportar `AI_MODEL=claude-haiku-4-5` como
  o modelo efetivamente em uso hoje em dev (secret `tb/dev/aja-agora/env`).

## Sem mudança de código

Nenhum commit de produto neste bloco: (a) capitalização/emoji já estava coberto; (b) a regressão
do funil está fora do `escopo_arquivos` deste bloco (`qualify-state.ts`/`tool-policy.ts`, não
`sanitizer.ts`/`gateway-openai.ts`) e precisa de investigação própria num fix novo; (c) P10 não
foi confirmado o suficiente pra propor fix, conforme a instrução explícita do bloco.

## Gaps honestos / próximos passos sugeridos

- **Abrir um fix novo** pra investigar a regressão do funil pós-onda-1 sob Qwen (tool-calling
  chamando `present_decision_prompt`/`present_contract_form` fora de fase, causando o
  BUG-REVEAL-LOOP de volta) — isso é sobre `qualify-state.ts`/`tool-policy.ts`, fora do escopo
  deste bloco.
- **`n=1`** em cada lado do bakeoff (baseline e novo) — LLM real em ambos os braços, uma única
  amostra tem ruído estatístico. A natureza do achado (tool-error estrutural novo, ausente no
  baseline) é qualitativamente diferente de flutuação de nota, mas idealmente mereceria 2-3
  repetições antes de uma decisão definitiva de produto.
- Considerar ampliar `normalizeGluedSentences` pra cobrir "pontuação + palavra minúscula" (não só
  maiúscula), já que o estilo de copy real do produto é lowercase-first — não implementado aqui
  por falta de confirmação sobre a origem exata da colagem (P10 continua inconclusivo).
- Log completo da execução em `.bakeoff/qwen-jornada-pos-r10-onda1.log` (local ao worktree,
  `.gitignore`d, não sobrescreve o baseline `.bakeoff/qwen-jornada.log`) — conteúdo relevante já
  reproduzido no card FIX-304 e aqui.
