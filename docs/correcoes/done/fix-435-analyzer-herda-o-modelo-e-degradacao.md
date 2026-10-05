---
id: FIX-435
titulo: "O analyzer herda o modelo padrão do projeto e não troca parcela por valor do bem"
status: done
bloco: analyzer-no-modelo-do-agente-e-degradacao
commit: 00dc0849
prioridade: alta
arquivos:
  - src/lib/llm/model-provider.ts
  - src/lib/llm/model-provider.test.ts
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/turn-analyzer.indisponivel.test.ts
  - src/lib/agent/parse-asset-value.ts
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/orchestrator/analyze.indisponivel.test.ts
  - src/lib/agent/langgraph/nodes/analyze.ts
  - src/lib/observability/langfuse/analisador-scores.ts
  - src/lib/observability/langfuse/analisador-scores.test.ts
  - scripts/sonda-analisador.ts
  - scripts/sonda-intent-aceite.ts
rodada: 2026-10-02
executado_em: 2026-10-02
---
## Palavras do operador
> "teve alguma degradacao muito loca ai, relacionada a assertividade do agente, preciso que voce veja" (Kairo, 02/10 12:15)
> "para mim isso tem que fazer alguma degradação relacionada a esse ajuste que a gente fez aqui do AB" (Kairo, 01/10 11:47:45)

## O que os dados dizem (reapurado SÓ com `is_simulated=false`)
A higiene das 43 conversas de teste do dono (`is_simulated=true`) permitiu separar tráfego de QA. Condução
entregue (`conducao_entregue`, Langfuse prod):

| era | sem teste |
|---|---|
| haiku até 20/09 22h | **0,93** (141/151) |
| qwen antes do A/B 20/09 22h–29/09 23h | **0,87** (127/146) |
| qwen+A/B até 01/10 | **0,78** (7/9 — quase todo o tráfego desses dias era teste, n=9) |
| **02/10** | **0,56** (9/16), **p=0,005** contra o qwen antes do A/B |

**Prioridade alta: o degrau de 02/10 é REAL e atingiu LEAD REAL.** O dono confirmou que as 3 conversas web
de 02/10 são tráfego, não teste — e são o **caso** deste card:
`7b5082a1` ("Guilherme"), `db26cd54` (anônima), `9b30b5ac` ("Fernando").

### Causa por turno (Langfuse prod, entrada e saída de cada geração)
- **Analyzer descartado como causa:** nos 7 turnos que falharam ele respondeu sem erro e certo (categoria,
  valor do bem 210–220 mil, intenção). Não mudou (haiku fixo pela env desde antes de 20/09), nada foi
  deployado entre 30/09 14:54 e 02/10, e em 01/10 ele teve 29/50 erros **com condução 0,94**.
- **Braço B com contexto que mente (3 turnos — `db26cd54` 10:57:31, 11:04:40, e o cliente repetindo "Carrro
  de 220 mil reais"):** "as opções já estão na sua tela / dá uma olhada nas parcelas", com tudo borrado →
  **FIX-432 (B1)**.
- **Número inventado no card (2 turnos — `db26cd54` 11:05:20, 11:07:15):** `compare_with_financing` devolveu
  R$ 5.678,45/mês e o modelo passou R$ 6.071 ao card → **FIX-436 (B5)**.
- **Fala do qwen sem pergunta / fechando sozinho (2+ turnos — `7b5082a1` 11:02:55, 772 caracteres sobre
  lance sem convite; `9b30b5ac` 11:09:05, fechamento "Show" e a pergunta sem "?"; `db26cd54` 11:03:16,
  fechamento sem pergunta no reveal; em 10:57:31 chamou `search_groups`, tool que não existe no grafo):**
  **não é código** — é a decisão do `AI_MODEL` (`PENDENTE-KAIRO` nº 1, com estes números).

### Ressalva de leitura
Os exemplos históricos de defeito usados na investigação (`0e5d777a`, `8b64899b`, `f0a494e3`, `3a08bf32`,
`576e5b66`, `ef18fd09`) são conversas de **TESTE do dono/Bruna** — provam o comportamento do produto em
produção, mas **não são lead real**. Já os 3 de 02/10 acima **são** lead real e é isso que sustenta o 0,56.
A degradação do A/B **não tem amostra** para ser afirmada (n=9); o sinal é a troca haiku→qwen — hipótese.

## O que mudou (D5)
1. `src/lib/llm/model-provider.ts` vira a **fábrica única** do gateway: `modeloDoAgente()`,
   `modeloAiSdkDoGateway(id)` (`claude-*` → provider Anthropic; o resto → cliente OpenAI-compatível do
   gateway via `openaiCompat.chat(id)`, e **não** `openai(id)`, que cai na Responses API que o LiteLLM não
   serve) e `MODELO_DO_AGENTE_PADRAO = "claude-sonnet-5"`.
2. O turn-analyzer passa a usar `modeloAiSdkDoGateway(modeloDoAgente())`; `AI_ANALYZER_MODEL` deixa de ser
   lido. `B4c` (commit `2a52f872`) refina a precedência para **`AI_ANALYZER_MODEL ?? AI_MODEL ?? default`**
   (cada um com `?.trim() ||`), num ponto só: `modeloDoAnalisador()` — override opcional que **herda** o
   modelo padrão.
3. **B4b** (commit `7667a59c`): `ANALYZER_TIMEOUT_MS` 6000 → **10000**, medido no gateway de produção
   (`qwen3.8-flash`, 10 payloads reais: p50 5,4 s · p90 6,9 s · máx 7,1 s; com 6 s, 3/10 cairiam no fallback).

## O que mudou (D6 — analyzer fora do ar não troca parcela por valor do bem)
- `TurnAnalysis` ganha `indisponivel?: true`; `NEUTRAL_FALLBACK` passa a carregá-lo (exportado para o teste).
- `parseParcelaMensal(text)`: número colado ao marcador mensal vira `parcelaAlvo`/`alvoDeBusca="parcela"`,
  **nunca** `creditMax` (reproduz `0e5d777a`: "Entre R$ 800 e R$ 1.200" virava `creditMin=creditMax=800`).
- Valor parseado abaixo de `CREDIT_BOUNDS[categoria].min` não vira valor do bem.
- Sinal determinístico `analisador_indisponivel` (BOOLEAN) emitido **como 0 também** (denominador), em todo
  turno de cliente, no mesmo trace do `conducao_entregue`.

## Provado
- `pnpm -s vitest run src/lib/llm src/lib/agent/orchestrator src/lib/agent/turn-analyzer src/lib/observability/langfuse`
  → **64 arquivos / 617 testes verdes** (B4 e B4b); `pnpm -s vitest run src/lib/llm src/lib/agent/turn-analyzer`
  → **20 testes verdes** (B4c, com 6 casos de precedência). `typecheck` exit 0.
- `grep -rln AI_ANALYZER_MODEL src scripts | grep -v '\.test\.'` = **só `src/lib/llm/model-provider.ts`**.

## PENDENTE-KAIRO (deploy)
**Em produção nada muda até tirar `AI_ANALYZER_MODEL=claude-haiku-4-5` da `environment` das task definitions
`aja-agora-prod` e `aja-agora-worker-prod`** — a env (override) vence e o analyzer continuaria no haiku. O
`AI_MODEL` (`qwen3.8-flash`) chega ao container pelo bloco `secrets`; o agente não roda no default.
A publicação da linha de vocabulário (`FIX-440`) via `pnpm sync-prompts` também é `PENDENTE-KAIRO`.