# Entrega — Observabilidade LLM completa + ciclo de avaliação (Langfuse)

Data: 2026-08-07 · Ambiente de validação: simulador local (`https://aja-app-develop.orb.local/admin/simulator/web`) · Projeto Langfuse: `aja-agora` em `https://langfuse.twobrainstechnology.com` (self-hosted v3.225.1)

## O que foi entregue

| Etapa | O quê | Evidência |
|---|---|---|
| 1. Tracing | 1 trace por turno (`turn:web`/`turn:whatsapp`) com spans dos nós do grafo, generations do converse (tool-loop) e do turn-analyzer (com tokens/modelo), e TODA tool com input/output | traces `4c39319f…`, `516f5cd0…` (19–26 observations); generations com usage (ex. 11932 in/100 out) |
| 2. Sessions | `sessionId` = `conversations.id`; conversa inteira agrupada | session `67a14614…` (2+ turnos), `4f009c73…` |
| 3. Score de feedback | `POST /api/admin/simulator/sessions/<id>/feedback` → `user_feedback` BOOLEAN no trace (traceId via data-part `data-trace`) | score no trace `1e297bf3…` (valor 1, comment "resposta boa, tom certo") |
| 4. Prompt Management | `aja-system-prompt` + `aja-turn-analyzer` versionados (label `production`), `pnpm sync-prompts` idempotente, cache 60s + fallback do código, versão linkada na generation | generation com `promptName=aja-system-prompt` v1; hot-swap provado: v2 criada via API → turno usou `promptVersion=2` SEM deploy (trace `e00b9e9b…`); label revertida pra v1 |
| 5. Dataset + runner | dataset `golden-set` (14 cenários) + `pnpm eval` (gate de promoção de prompt) com dataset run linkando 1 trace por cenário | run `gate-d0362a14-202608070333` — 14 itens com traceId; resultado 6 PASS · 0 FAIL · 8 SKIPPED (sem `E2E_TEST_CPF`) |
| 6. LLM-as-a-judge | Evaluators GERENCIADOS na UI (`judge_resolved`, `judge_hallucination`, `judge_tone`), modelo `claude-haiku-4-5` via LiteLLM interno, rodando sozinhos sobre traces novos com tag `channel:web` | traces `1ecb221d…` e `94b59950…` com os 3 scores automáticos e justificativa em português (ex.: pergunta "garante contemplação em 2 meses?" → `judge_hallucination=0` porque o agente RECUSOU corretamente) |
| Fallback (lei nº 1) | Sem envs `LANGFUSE_*` → no-op total | boot sem menção a langfuse, turno 200 com resposta real, 0 traces exportados; suíte verde sem envs |

## Infra tocada (compartilhada, aprovada pelo Rômulo)

- **LiteLLM com porta fixa interna**: `tb-litellm-shared:8` (`hostPort 4000`; antes dinâmica), `desiredCount` 3→2 (capacidade real — a 3ª task não cabia em memória desde 15/07 e bloqueava deployments), deployment `min=50%/max=100%`. Endpoint estável: `http://litellm.tb.local:4000` (só VPC). Consumidores por SRV se re-adaptaram sozinhos; sem downtime.
- **SG**: `sg-0bd4ec9bffc463859` (hosts ECS) ← ingress tcp/4000 apenas de `sg-0dde733c3be20fc47` (task Langfuse) — regra `sgr-07583f9a1d640bbc4`. Nada público.
- **Langfuse `tb-langfuse-shared:6`**: envs `LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST=litellm.tb.local` e `…_IP_SEGMENTS=10.30.1.0/24` (a proteção anti-SSRF bloqueava LLM Connection pra IP privado; a env precisa estar na TASK DEFINITION — chave nova só no secret não chega ao container). Também gravadas no secret `tb/shared/langfuse/env`.
- Registro manual do Cloud Map `litellm` atualizado pra `10.30.1.143:4000`.

## Regras de operação (resumo; detalhe no README)

- Prompt novo → label `production` SÓ com `pnpm eval` verde. Cenários pulados por falta de `E2E_TEST_CPF`/`E2E_TEST_CELULAR` NÃO contam como verde — providenciar as credenciais de teste destrava os 8 cenários de jornada completa.
- Observabilidade nunca quebra o app: envs ausentes = no-op; todo erro de SDK é engolido com log.
- Segredos são mascarados nos traces (`mask.ts`); dado de negócio trafega (instância nossa).

## Verificação final

`pnpm lint` ✓ · `pnpm typecheck` ✓ · `pnpm test:unit` 314 arquivos / 2277 testes ✓ (tudo em container, sem envs Langfuse nos testes — no-op garantido)
