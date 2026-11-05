# Juiz online (B8) — evaluator LLM-as-judge na instância

O juiz online roda **na instância Langfuse** (https://langfuse.twobrainstechnology.com): a cada
trace de turno, um evaluator LLM dá nota e grava o score `judge_avancou`. É medida de
**tendência em produção** — o veredito de juiz é hipótese, **nunca gate** (a pegada da promessa
falsa é a reconciliação determinística do B5).

- Script de criação: `scripts/langfuse-judge-online.ts` (idempotente).
- Rubrica: texto portado de `src/lib/eval/rubric.ts` (mesmas 5 dimensões e âncoras); o score
  único do evaluator é a **média das 5 dimensões**, 0 a 1.
- Endpoints usados (todos vivos, medidos na 4.6.0 OSS):
  `POST/GET/PATCH /api/public/unstable/evaluators` e `/unstable/evaluation-rules`;
  conferência de vida em `GET /api/public/v3/scores`.

## Desenho

| peça | valor |
|---|---|
| Evaluator | `judge_avancou` (scope `project`, type `llm_as_judge`, NUMERIC 0..1) |
| Rule | `target: "observation"` — **sempre**; trace-level é desprecado na v4, não se usa |
| Filtro | `isRootObservation = true` (a root "Conversational Turn" do plugin; carrega o mesmo input/output que o trace carregava) |
| Mapping | `entrada` ← observation `input`; `saida` ← observation `output` |
| Sampling | env `LANGFUSE_JUDGE_SAMPLING` (fração 0 < s ≤ 1; padrão 1 — **produção deve usar < 1**) |
| Modelo | env `LANGFUSE_JUDGE_PROVIDER` / `LANGFUSE_JUDGE_MODEL` (padrão `anthropic` / `claude-sonnet-4-6`) |
| Score gravado | `judge_avancou` — o monitor do B11 (`judge_avancou` 1d < 0,5) lê este score |

## Rodar

```bash
pnpm tsx scripts/langfuse-judge-online.ts
```

Credenciais: `LANGFUSE_BASE_URL`/`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` do ambiente,
ou do cofre (`secrets.sh get-key pi-agentes-aja-langfuse <CHAVE>`). Re-run idempotente:
evaluator só se não existe; rule existente é sincronizada por PATCH (enabled, sampling,
filter conforme env).

## PENDENTE-KAIRO — LLM Connection

A instância só cria evaluator LLM-as-judge quando o projeto tem uma **LLM Connection**
(`evaluator_preflight_failed` sem ela). A API pública **não expõe criação de connection**
(404 medido em `/api/public/unstable/llm-connections` e variantes) — a criação é na UI:

1. Settings → LLM Connections → conectar um provider **alcançável da instância**.
2. O gateway LiteLLM local (`127.0.0.1:4100`) **não é alcançável** da instância remota — não
   use como base URL da connection.
3. Depois de criar a connection, rodar o script de novo: ele cria o evaluator + rule sozinho.

## Runbook — conferência de vida

**Nunca confie no status `active` da rule.** Caso medido: uma rule `enabled: false` com
regra homônima aparentemente `active` ficou **3 dias parada sem nenhum aviso**. Além disso,
após **5 falhas de entrega** o Langfuse **desabilita a automação sozinho**, silencioso.

A vida se confere pelo **último score produzido**:

```bash
curl -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
  "$LANGFUSE_BASE_URL/api/public/v3/scores?name=judge_avancou&limit=1"
```

Interpretação:

- Score com `timestamp` **de hoje ou do dia passado** (coerente com o sampling) → automação
  viva; feche a conferência.
- `data: []` ou timestamp velho além do intervalo esperado pelo sampling → **automação morta**:
  abrir a UI (evaluation rules), checar se a rule está `enabled`, se a LLM Connection responde
  e se há falhas de entrega (5 falhas = desabilitada). Depois de corrigir, re-run do script
  (ele re-sincroniza por PATCH) e conferir de novo pelo score.

Rotina: conferência de vida 1× por dia (combinar com o monitor NO_DATA do B11, que pega o
"pino" do silêncio). O script, no fim, imprime o último score — usar essa saída como prova
rápida depois de qualquer mudança.

## O que este juiz não faz

- Nunca trava fala, nunca reescreve fala, nunca é gate de promoção — só grava score.
- Julga um turno por vez (a root observation); a conversa inteira continua sendo julgada
  offline pelo juiz de `src/lib/eval/` no `pnpm eval`.
- Não substitui os sinais determinísticos (`numero_fora_da_cota`, `promessa_sem_fato`).
