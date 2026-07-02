---
id: FIX-209
titulo: "Upgrade do agente claude-sonnet-4-6 → claude-sonnet-5 (thinking OFF explícito, remove temperature per-persona que dá 400, verifica alias no gateway)"
status: todo
severidade: media
projeto: aja-agora
arquivos:
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/mesa-copilot/index.ts
  - src/lib/agent/agents/builder.*.test.ts
  - src/lib/agent/personas.ts
rodada: 2026-07-02 — pedido do Kairo ("dentro dessa melhoria já vamos incluir a mudança do modelo pra sonnet 5")
---

# FIX-209 — Upgrade do agente para Claude Sonnet 5

## 1. Palavras do operador (literal)

> "dentro dessa melhoria ja vamos incluir a mudanca do uso do modelo para o sonnet 5 -
> update recente da anthropic modelo melhor."

Decisão do Kairo (AskUserQuestion 2026-07-02): **thinking OFF explícito** — trocar o modelo
preservando a latência e o comportamento de resposta atuais (o chat tem constraint de <3s).

## 2. NÃO é troca de string — breaking changes reais (Sonnet 4.6 → Sonnet 5)

Modelo hoje: `process.env.AI_MODEL ?? "claude-sonnet-4-6"` em:
- `src/lib/agent/agents/builder.ts:274` (agente principal do cliente)
- `src/lib/agent/mesa-copilot/index.ts:58` (copiloto admin)

Migrando pra `claude-sonnet-5` (alias correto — catálogo do gateway, sem ID datado):

| Breaking change | Ação |
|---|---|
| **`temperature: row.temperature` (builder.ts:279) → 400.** Sonnet 5 rejeita `temperature` não-default. | **Remover** o param `temperature` das chamadas que usam sonnet-5 (builder + mesa-copilot, se aplicável). O tom por persona passa a ser guiado por **prompt** (as personas já têm system prompt/traits distintos). NÃO inventar compensação elaborada — só reforçar no prompt se alguma persona regredir de tom visivelmente. |
| **Adaptive thinking LIGA por default** (4.6 era desligado por omissão) → +latência + pausa antes do 1º token. | **Desligar explicitamente** (`thinking: { type: "disabled" }` via `providerOptions.anthropic` do `@ai-sdk/anthropic`) — decisão do Kairo (preservar <3s). Verificar `providerOptions` já existentes em builder.ts (~L218/228) pra não conflitar. |
| **Tokenizer novo (~30% mais tokens)** pro mesmo texto. | Re-baseline: conferir limites de `max_tokens`/output e o piso de prompt-cache (Sonnet 5 ≈ 2048 tokens de prefixo mínimo). Não travar por isso; só ajustar se algo estourar. |
| **Gateway LiteLLM precisa ter o alias `claude-sonnet-5` registrado.** O gateway usa aliases (`claude-haiku-4-5` está lá); `claude-sonnet-5` é incerto. | ⚠️ **VERIFICAR ANTES de considerar deploy** (query no gateway / config do LiteLLM shared). Se NÃO estiver registrado, o request 404 em runtime. Sem o alias → **PENDENTE-KAIRO** (registrar a virtual key/model no LiteLLM é infra shared, fora deste worktree) — entregar o código pronto + documentar o gap, NÃO deployar às cegas. |

`temperature` é o único param de sampling em uso (o comentário do builder confirma: "Claude
only exposes temperature, no topP/penalty") — não há `top_p`/`top_k` pra remover.

## 3. Correção proposta (o quê × onde)

| O quê | Onde |
|---|---|
| Trocar o default `"claude-sonnet-4-6"` → `"claude-sonnet-5"` (mantém o override por `AI_MODEL`). | `builder.ts:274`, `mesa-copilot/index.ts:58` |
| Remover o param `temperature` das chamadas sonnet-5 (evita 400). Persona.temperature pode ficar no schema (inofensivo) OU sair — decida com o mínimo de blast radius (sem migration de DB se der pra evitar). | `builder.ts:279` (+ `mesa-copilot` se passar temperature) |
| Desligar thinking explicitamente (`thinking: { type: "disabled" }`) nas duas chamadas. | `builder.ts`, `mesa-copilot/index.ts` (`providerOptions.anthropic`) |
| Verificar alias `claude-sonnet-5` no gateway LiteLLM; ausente → PENDENTE-KAIRO documentado. | (verificação; não é edição de código do app) |

## 4. Regressão exigida

**Camada 1 (structural, obrigatória):** `builder.*.test.ts` — assert que (a) o modelo default
é `claude-sonnet-5`; (b) a config da chamada NÃO inclui `temperature` (senão 400); (c) thinking
está `disabled` explicitamente. Idem pro mesa-copilot se tiver teste.

**Camada 2 (cassette):** NÃO adicionar cassette novo (mudança de config, não comportamento
observado em bug). **MAS** rodar a suíte `tests/regression/agent-trajectory.test.ts` inteira e
provar que continua **verde** — os cassettes usam `MockLanguageModelV2` (não o modelo real), então
a troca de default não deve quebrá-los; se quebrar, é sinal de acoplamento indevido a investigar.

**Camada 3 (eval):** a suíte `tests/eval/agent-flow.eval.test.ts` (nightly, modelo real) é o
lugar de validar o Sonnet 5 de verdade — mas só roda se o alias existir no gateway. Documentar.

## 5. Notas de execução

- **Ler a skill `claude-api`** (`/claude-api`) pra a sintaxe exata do `@ai-sdk/anthropic`
  (thinking disabled via providerOptions; nada de `budget_tokens`; `temperature` fora).
- **NÃO tocar** nos modelos de eval/diagnose/judge (`diagnose.ts`, `eval/judge.ts`,
  `eval/jornada-judge.ts` = `claude-sonnet-4-6`) — são infra de eval nightly; trocar o juiz
  quebra baseline. Escopo é SÓ o agente de runtime (builder) + copiloto admin (mesa-copilot).
- Bloco **disjunto** do bloco-funil-nao-trava (arquivos diferentes; NÃO toca
  `agent-trajectory.test.ts` — só a roda pra provar verde). Paralelo nível 1.
