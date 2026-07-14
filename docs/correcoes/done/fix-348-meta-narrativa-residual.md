---
id: FIX-348
titulo: "P1 — meta-narrativa de pipeline sobrevive há 3 rodadas ('Deixa eu apresentar as opções pra você escolher')"
status: done
bloco: bloco-f-turno-vazio-meta
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/sanitizer.test.ts
  - src/lib/agent/orchestrator/directives.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 4
---

# FIX-348 — o agente ainda narra o próprio pipeline

## Cenário (3ª rodada seguida)
No reveal, o agente empilha frases que **anunciam o passo** em vez de dar o passo:

> "Separei as melhores pra você conferir — vem ver qual encaixa melhor."
> "Deixa eu apresentar as opções pra você escolher uma e simular:"
> "Escolhe uma pra simular e ver como fica a parcela com tudo incluso."

Três frases dizendo a MESMA coisa. Soa como log de execução, não como gente vendendo.

## Root cause
O FIX-335 criou `PRODUCT_STEP_ANNOUNCEMENT_PATTERNS` (sanitizer) mas ele cobre só parte dos
padrões ("Agora vou…"). Escapa tudo que é "Deixa eu…", "Separei…", "Vou te mostrar…".

E a raiz está no **directive**: ele descreve a sequência numerada ("(1) escreva… (2) chame…") de um
jeito que o modelo ECOA como narração.

## Correção proposta
| O quê | Onde |
|---|---|
| Reescrever o directive do reveal pra pedir o RESULTADO, não a sequência ("apresente as opções", não "(1) escreva uma frase (2) chame a tool") | `directives.ts` (search-summary / recomendação) |
| Ampliar o guard pra família toda: "deixa eu (te )?(mostrar\|apresentar\|trazer)", "separei", "vou te mostrar", "vou apresentar" — quando SEGUIDO de um card no mesmo turno | `sanitizer.ts` |
| ⚠️ Cuidado pra não virar mordaça: o agente pode e deve fazer transições curtas. O alvo é a REDUNDÂNCIA (3 frases pro mesmo ato), não a transição | — |

## Regressão exigida
- Unit: "Deixa eu apresentar as opções pra você escolher uma e simular:" é dropado quando um card
  sai no mesmo turno.
- Unit: uma transição curta legítima ("Olha só o que encontrei:") PASSA.

## Correção aplicada

**`sanitizer.ts`** — `PRODUCT_STEP_ANNOUNCEMENT_PATTERNS` ganhou a família nova:
- **Grupo incondicional** (mesmo risco de recomendar/destacar/detalhar/aprofundar, nenhuma narração
  legítima do domínio usa esses verbos assim): sem mudança de risco aqui — `apresentar`/`trazer`
  ACABARAM não entrando neste grupo (ver decisão abaixo).
- **Grupo de objeto VAGO** (mesma guarda de `mostrar`/`simular`, que já existia): `apresentar` e
  `trazer` entraram AQUI, não no incondicional — `"Deixa eu te apresentar a proposta da Itaú, R$
  1.200 por mês"` é narração legítima com entidade concreta (mesma classe de `"Vou simular a
  Rodobens com R$ 900 mil"`), então precisa da MESMA proteção. A lista de objetos vagos ganhou `as
  opções (pra você escolher)`, `o cenário completo`, `os números exatos` — as frases EXATAS do
  veredito rodada 4.
- **`"separei"` NÃO virou guard.** Motivo: é a ÚNICA palavra do card que colidia com copy JÁ
  aprovada — `buildSearchSummaryDirective` sugeria `"Separei as melhores opções pro seu perfil:"`
  como exemplo de abertura legítima (relatar o RESULTADO da busca). Bloqueá-la incondicionalmente
  teria calado uma abertura válida — o MESMO padrão de bug que já aconteceu 2× nesta campanha (guard
  calando fala válida). Em vez disso, removida do directive (só resta `"Encontramos N boas opções
  pra você!"` como exemplo) — sem a sugestão, não há mais motivo pra ela aparecer como abertura, e
  sem estar mais "aprovada" pelo prompt, não faz sentido reforçá-la em código sem uma reincidência
  real observada.

**`directives.ts`** (`buildSearchSummaryDirective`) — o aviso anti-narração (que já dizia "não
anuncie o próximo passo" em PROSA, sem barreira em código — exatamente o padrão que este projeto
proíbe) ganhou a família nova de exemplos ruins, mantendo defesa-em-profundidade (prompt explica o
PORQUÊ, código barra de verdade). NÃO reescrevi a sequência numerada (1-6) do FLUXO OBRIGATÓRIO —
ela describe ORDEM DE TOOL-CALLS que é um invariante real (present_recommendation_card e
present_comparison_table são inseparáveis, FIX-78), não meta-narrativa; reescrever a estrutura
inteira seria risco desproporcional (muitos invariantes já testados dependem dela) sem estar coberto
pela regressão exigida.

## Regressão (como foi verificada)

- `sanitizer.test.ts` (FIX-348): TDD strict, RED→GREEN — reproduz as 6 frases exatas do veredito
  rodada 4 + as 2 regressões literais exigidas pelo card + 2 testes anti-mordaça (entidade concreta
  sobrevive; outras transições curtas sobrevivem). Achado durante o TDD: a primeira versão colocava
  `apresentar`/`trazer` no grupo incondicional — RED no teste anti-mordaça (`"Deixa eu te apresentar
  a proposta da Itaú, R$ 1.200 por mês"` foi dropado por engano); corrigido movendo pro grupo de
  objeto vago antes de fechar GREEN.
- `pnpm test:unit` completo: 386 arquivos / 3563 testes verdes (baseline pós-FIX-347 era 3557 — as 6
  novas são deste fix). Suíte ampla de `src/lib/agent/orchestrator/` + `src/lib/chat/` +
  `src/app/api/chat/` (exceto integration): 763/765 verdes — as 2 falhas restantes são
  `IDENTITY_ENC_KEY` ausente na invocação direta do vitest (pré-existente, nada a ver com este diff,
  mesma causa já confirmada no FIX-347).
