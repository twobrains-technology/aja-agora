---
id: FIX-88
bloco: bloco-b-artifacts-produto
slug: expandir-recomendacoes-remover-teto-3
titulo: "Remover o teto de 3 recomendações: 1 hero + 5 ranqueadas + 'ver todas' expansível (ordenar/filtrar)"
status: todo
severidade: media
projeto: aja-agora
rodada: 2026-06-28 — revisão da etapa de recomendação (passo 5 da jornada)
evidencia: []
mexe_em:
  - src/lib/agent/recommendation.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/chat/types.ts
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/comparison-table.tsx
  - src/lib/agent/system-prompt.ts
  - docs/jornada/jornada-canonica.md
---

## Palavras do operador
> "temos que tirar essa limitação de 3 planos. temos que deixar trazer todos, podemos por ux pedir para llm escalar 3, mas o usuario conseguiria expandir pra ver todos. temos que pensar na melhor ux para isso."

Decisão de UX fechada com o Kairo nesta sessão (AskUserQuestion):
> Expansão **inline** "Ver todas as N"; curadoria = **destaca 1 (hero) + mostra outras 5 ranqueadas + opção de ver mais**; lista expandida **já com ordenar + filtrar**.

## Cenário
- **Rota/tela:** chat web — etapa de recomendação (passo 5), após "Buscar opções reais".
- **Comportamento atual:** o sistema corta as ofertas da Bevi no **top-3** (1 por administradora) e **descarta o resto**. A Bevi pode devolver muito mais.

## Esperado × Atual
- **Atual (teto de 3):**
  1. `rankGroups(..., topN = 3)` (`recommendation.ts:99`) — corta no top-3, 1 por admin (`seenAdmins`); descarta o restante.
  2. `executeRecommendGroups` (`ai-sdk.ts:403-427`) — retorna só os 3 ranqueados (`ranked.map`, `total: ranked.length`). **Aqui é onde o excedente da Bevi morre.**
  3. UI (`comparison-table.tsx` / `recommendation-card.tsx`) renderiza os 3. Copy canônica do docx = "Encontramos 3 boas opções".

- **Esperado (hierarquia de 3 níveis, mobile-first):**
  1. **1 hero** — a #1 do ranking, card completo (`recommendation-card.tsx` atual: selo "Recomendação" + "Por que esta recomendação?").
  2. **5 secundárias** — top 2–6, formato compacto (cards menores empilhados ou mini-linhas), cada uma clicável ("Tenho interesse"). Visíveis sem expandir.
  3. **"Ver mais opções"** — botão que expande **inline** (logo abaixo, mesmo fluxo do chat) o restante (7..N), **com ordenar** (melhor match / menor parcela / contemplação / prazo) **e filtrar** (por administradora).

## Detalhe arquitetural (decidido — não reabrir)
- **A LLM continua vendo só o destaque (hero + 5 = 6 itens)** pra narrar/curar. A lista completa (7..N) vai do **backend direto pro artifact (UI), SEM passar pela LLM** — senão estoura contexto/token narrando dezenas de ofertas. Hoje o excedente é descartado em `executeRecommendGroups`; a mudança é **preservar todas as ofertas ranqueadas no payload do artifact** e marcar quais são hero/secundárias.
- Token-safe: o tool-result que a LLM vê carrega os 6 + um `total: N`; o payload do artifact carrega as N completas.

## Pista de causa / pontos a resolver (A CONFIRMAR na todo-blocks)
1. **`rankGroups`** — remover `topN = 3` hardcoded; retornar todas ranqueadas. Decidir como a diversificação por administradora (`seenAdmins`) se aplica agora: provavelmente garantir diversidade de admin só no bloco visível (hero + 5), e a lista completa mostra tudo.
2. **`recommendWithFallback` / `MIN_OPTIONS`** — o piso de ≥3 continua válido; o **teto** some. Se a Bevi devolver < 6, mostra 1 hero + o que sobrar (sem inventar). Revisar `insufficientOptions`.
3. **Shape do payload** (`types.ts`) — novo formato tipo `{ hero, secondary[≤5], all[N], total }` + estado de ordenação/filtro client-side. Pode ser evolução da `comparison-table` ou um artifact novo "lista de recomendações". Asserts em `recommendation-card.*.test.tsx` e `comparison-table.*.test.tsx` provavelmente quebram.
4. **UI** — variante compacta do card pras 5 secundárias e pras linhas da lista expandida; controles de ordenar/filtrar (client-side sobre o payload completo).
5. **Prompt** (`system-prompt.ts`) — regra de "destacar 1 + 5" e copy ("Encontramos N opções — esta é a que mais combina"), substituindo a lógica de top-3.

## ⚠️ Dependência de produto (validar ao promover)
- Muda a **jornada canônica**: copy "Encontramos 3 boas opções" (docx) → algo como "Encontramos N opções — esta é a melhor pra você + 5 alternativas". `CLAUDE.md` é inviolável: divergência código×docx = defeito. **Validar a nova copy/fluxo contra `docs/jornada/jornada-canonica.md` (e com o Bernardo) antes de implementar** — atualizar o docx se aprovado.
- Há decisões anteriores do Bernardo no card de recomendação (taxa adm escondida, rótulo qualitativo). Manter consistência.
