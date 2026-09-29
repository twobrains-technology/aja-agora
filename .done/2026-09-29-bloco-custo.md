# bloco-custo — FIX-391, FIX-392, FIX-393 (o CPC que a cliente quer fechar)

**Status:** concluído · 2026-09-29 · branch `kairogyn/feat-custo-de-ia-e-mensagem` (worktree
`feat-custo-de-ia-e-mensagem`)

O pedido da cliente, 22/09: *"ver o custo de IA e das mensagens de remarketing […] para a gente
calcular o CPC depois"*. O bloco entrega as duas metades do custo e o CPC — na **rota B** (a fonte
atual, o Langfuse), como o dono fechou com a Nebulosa em 28/09.

## De onde exatamente sai o número de cada custo

| Número | Fonte precisa | Onde no código |
|---|---|---|
| **Custo de IA** | `GET {LANGFUSE_BASE_URL}/api/public/metrics` — Metrics API **v1** (`view=observations`, dimensões `sessionId` + `providedModelName`, `timeDimension.granularity=day`, métrica `totalCost`, em USD) | `src/lib/admin/custo-de-ia.ts:lerCustoDoLangfuse` |
| **Vínculo do custo de IA** | `conversations` (`created_at` no período, `is_simulated=false`); o `sessionId` do Langfuse é o `conversationId` do Postgres | `custo-de-ia.ts:conversasDoPeriodo` |
| **Cotação USD→BRL** | cadastro `custos_config.cotacao_usd_brl` | `custos-do-cadastro.ts` |
| **Investimento Meta** (o oficial) | `meta_insights_diarios.spend_cents`, **nível `campaign`** | `performance-queries.ts:computeCustosDoCpc` |
| **Custo de mensagem — volume** | `whatsapp_outbound_queue` (`status='sent'`, `sent_at` no período, chave `usage_key`) **+** `messages.template_name` (`role='assistant'`, conversa não simulada) | `custo-de-mensagem.ts:contagensDoPeriodo` |
| **Custo de mensagem — preço** | cadastro `custos_config.preco_mensagem_cents` | `custo-de-mensagem.ts` |
| **Denominador do CPC** | `contagensDoFunil` (visitas do período) — mesma definição de "qualificado" do resto da tela | `performance-queries.ts` |

## O que a tela mostra quando o preço de mensagem NÃO está cadastrado

Mostra a **contagem** (o volume que saiu, por template) e diz **"sem preço cadastrado"** — e o CPC
sai como **"não calculável"**, com o motivo escrito, **nunca "R$ 0,00"**. É a diferença entre "não
deu para calcular" e "custou nada", e ela muda a decisão de quem lê. A lei vale para os três itens e
para cada motivo nomeado: `sem_dado`, `sem_vinculo`, `modelo_sem_preco`, `sem_cotacao`,
`fonte_indisponivel` (IA) e `sem_preco` (mensagem). O teste disso foi escrito **antes** da
implementação em cada item.

## O que foi entregue

- **FIX-391 — custo de IA da fonte (`custo-de-ia.ts`)**: função pura `somarCustoDeIA` (cruza Langfuse
  × Postgres por `sessionId`), borda `lerCustoDoLangfuse` na Metrics API v1 (o self-hosted v3 **não**
  tem a v2), e `computeCustoDeIA` com fontes injetáveis. Somatório por modelo e por dia, conversão
  para real pela cotação cadastrada.
- **FIX-392 — custo de mensagem (`custo-de-mensagem.ts`)**: contagem por template (duas fontes
  disjuntas, somadas uma vez cada) + preço de cadastro. Sem preço, a contagem permanece e o custo é
  o motivo `sem_preco`.
- **FIX-393 — a tela do CPC (`bloco-de-custos.tsx`, `custos-do-cpc.ts`, `computeCustosDoCpc`)**:
  bloco com investimento Meta, custo de IA, custo de mensagem, conversas/qualificados e o CPC
  resultante, **cada número com a fonte declarada**; cálculo puro `calcularCpc`, shape na resposta de
  `/api/admin/performance` e render na página de Performance.
- **Cadastro `custos_config`** (migration `0061`): chave-valor para `cotacao_usd_brl` e
  `preco_mensagem_cents`, mesmo desenho do `remarketing_config` (linha ausente = "não calculável").

## Decisões de desenho (e o porquê)

1. **Núcleo puro, borda isolada.** `somarCustoDeIA`/`montarCustoDeMensagem`/`calcularCpc` não fazem
   I/O; quem lê são as bordas. Foi o que permitiu provar os seis motivos sem tocar o Langfuse — e
   impedir que um teste grave custo de teste na fonte.
2. **v1, não v2.** O servidor é self-hosted v3.225.1; a Metrics API v2 é v4-only, e é ela que proíbe
   agrupar por `sessionId`. A v1 permite, e é a que o cruzamento por sessão exige.
3. **A cotação entra como cadastro, não como constante.** O Langfuse reporta em USD e o CPC é em BRL.
   Cadastro (não código) mantém o YAGNI do spec e evita deploy para acompanhar o dólar.
4. **`0` (medido) ≠ `null` (preço ausente).** Custo zero legítimo é valor; preço que não se sabe é
   motivo. O guarda `modelo_sem_preco` só dispara com `null` explícito da fonte.

## Gaps honestos (registrados no ADR `docs/decisoes/blocos/2026-09-28-bloco-custo.md`)

- A Metrics API devolve `0` (não `null`) para modelo sem preço — indisponível distinguir de custo
  zero legítimo. Item de operação (Gustavo), como o spec previu.
- A contagem de mensagem **subconta** o envio direto de template já aprovado (não deixa rastro em
  banco — lacuna do ADR `2026-09-28-bloco-toques`). O FIX-392 pede exatamente as duas fontes que
  deixam rastro; completar a cobertura exige dar rastro àquele envio (fora do bloco).
- `usage_key` (fila) e `template_name` (mensagens) são espaços de nome diferentes; o total fecha, a
  leitura por template pode abrir duas linhas para o mesmo template.
- O dia do custo de IA é o da fonte (UTC), não o dia do negócio (`America/Sao_Paulo`) — não muda o
  total do período fechado, muda a linha do gráfico por dia.

## Prova

```
pnpm vitest run src/lib/admin/                    → 47 arquivos / 532 testes, todos verdes
pnpm vitest run src/components/admin/performance/ → 4 arquivos / 25 testes, todos verdes
pnpm typecheck                                    → limpo
```

Os testes novos cobrem, por item: FIX-391 (8 unit do núcleo + 4 do mapeamento do payload + 2 da
costura, sem rede), FIX-392 (4 unit do caso com/sem preço + 2 de integração da contagem com semente)
e FIX-393 (5 unit do CPC + 3 do bloco na tela + 2 de integração do investimento). **Nenhum teste fala
com o Langfuse de verdade.**

Commits (1 por item, Conventional PT-BR): `a3faddf5` (391) · `add7e98a` (392) · `217980f4` (393).
FIX-391/392/393 movidos para `docs/correcoes/done/`.