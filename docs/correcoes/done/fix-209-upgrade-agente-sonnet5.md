---
id: FIX-209
titulo: "Upgrade do agente claude-sonnet-4-6 → claude-sonnet-5 (thinking OFF explícito, remove temperature per-persona que dá 400, verifica alias no gateway)"
status: done
commit: 838ac55a
executado_em: 2026-07-02
severidade: media
projeto: aja-agora
arquivos:
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/agents/model-sonnet5.test.ts
  - src/lib/agent/mesa-copilot/index.ts
rodada: 2026-07-02 — pedido do Kairo ("dentro dessa melhoria já vamos incluir a mudança do modelo pra sonnet 5")
---

# FIX-209 — Upgrade do agente para Claude Sonnet 5

## Resultado (2026-07-02)

Implementado e verificado em container transitório do worktree (gate `pnpm test:unit`;
host sem node_modules → hook não roda → commit `--no-verify` com gate verificado no
container, realidade documentada deste worktree Superset).

- **Modelo**: `claude-sonnet-4-6` → `claude-sonnet-5` no `builder.ts` (agente de runtime)
  e no `mesa-copilot/index.ts` (copiloto admin). Override por `AI_MODEL` preservado.
- **temperature removido** das duas chamadas (Sonnet 5 dá 400 em não-default). Tom por
  persona passa a ser guiado pelo system prompt/traits. `persona.temperature` fica no
  schema (inofensivo — não é passado ao modelo).
- **thinking OFF explícito** (`thinking: { type: "disabled" }` via `providerOptions.anthropic`
  do `@ai-sdk/anthropic`) nas duas chamadas — Sonnet 5 liga adaptive por default; desligamos
  pra preservar o <3s do chat. No builder a config vive numa const nomeada (nível-request,
  sem relação com o `cacheControl` dos blocos de system → não colide com o invariante do
  `system-messages.fix-77.test.ts`, que segue verde).
- **Camada 1** (`src/lib/agent/agents/model-sonnet5.test.ts`): estrutural, sem DB, roda no
  `test:unit` (o glob `builder*.test.ts` é EXCLUÍDO do gate). Asserta modelo=`claude-sonnet-5`,
  ausência de `temperature`, `thinking: disabled`. **Vista falhar 6/6 antes do fix, verde
  depois.**
- **Camada 2**: `tests/regression/agent-trajectory.test.ts` segue verde (cassettes mockam o
  modelo — `MockLanguageModelV2` — a troca de default não os afeta). Nenhum cassette novo
  (mudança de config, não comportamento observado).

## ⚠️ PENDENTE-KAIRO — alias `claude-sonnet-5` no gateway LiteLLM

**Não foi possível verificar deste worktree.** O ambiente dev local não está cabeado ao
gateway (`LITELLM_SRV_NAME` vazio) e o SRV Cloud Map `litellm-srv.tb.local` não resolve fora
da VPC AWS (`ESERVFAIL`). Registrar/verificar o model/virtual-key no LiteLLM é infra shared
(tb-cluster sa-east-1), fora deste worktree.

- **Dev**: `gateway-anthropic.ts` cai direto na Anthropic quando o gateway não está
  configurado; `claude-sonnet-5` é um modelo Anthropic real → dev funciona direto.
- **Prod**: roteia via LiteLLM → **404 em runtime se o alias não estiver registrado**.
  Antes de elevar pra prod, registrar `claude-sonnet-5` no gateway (skill
  `twobrains-aws-platform:shared-litellm`) e confirmar. **NÃO deployar às cegas.**

## 1. Palavras do operador (literal)

> "dentro dessa melhoria ja vamos incluir a mudanca do uso do modelo para o sonnet 5 -
> update recente da anthropic modelo melhor."

Decisão do Kairo (AskUserQuestion 2026-07-02): **thinking OFF explícito** — trocar o modelo
preservando a latência e o comportamento de resposta atuais (o chat tem constraint de <3s).

## 2. Breaking changes tratados (Sonnet 4.6 → Sonnet 5)

| Breaking change | Ação tomada |
|---|---|
| `temperature` não-default → 400. | Removido o param das chamadas (builder + mesa-copilot). |
| Adaptive thinking LIGA por default. | `thinking: { type: "disabled" }` via `providerOptions.anthropic`. |
| Tokenizer novo (~30% mais tokens). | Sem estouro observado — `max_tokens`/limites não são passados explicitamente no builder/mesa; `stopWhen` é por steps. Piso de prompt-cache do Sonnet 5 (~2048 tokens) fica abaixo do prefixo estável real. |
| Gateway LiteLLM precisa do alias. | PENDENTE-KAIRO (ver acima). |

`temperature` era o único param de sampling em uso (Claude só expõe temperature) — não havia
`top_p`/`top_k` pra remover.

## 3. Fora de escopo (intocado, de propósito)

`diagnose.ts` (`DIAGNOSIS_MODEL`), `eval/judge.ts` (`JUDGE_MODEL`), `eval/jornada-judge.ts`
(`JORNADA_JUDGE_MODEL`) e `app/api/admin/personas/[id]/assist/route.ts` seguem em
`claude-sonnet-4-6` — juízes de eval nightly (trocar quebra baseline) e o assist admin não
estão no escopo do upgrade de runtime.
