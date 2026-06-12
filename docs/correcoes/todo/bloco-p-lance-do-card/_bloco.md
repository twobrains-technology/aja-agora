---
bloco: bloco-p-lance-do-card
branch: fix/lance-do-card
workspace: fix-lance-do-card
onda: 1
depends_on: []
paralelo_com: [bloco-n-optin-redundante, bloco-o-outras-opcoes-dedupe, bloco-q-handoff-msg-duplicada, bloco-r-scroll-inteligente, bloco-s-funil-canonico]
itens: [FIX-30]
escopo_arquivos:
  - src/lib/adapters/bevi/offer-mapper.ts
  - src/components/chat/artifacts/simulation-result.tsx (render do bloco de lance)
conflitos_esperados:
  - "src/components/chat/artifacts/simulation-result.tsx: nível 2 com bloco-s (aqui o render do bloco de lance; lá o handler de actions — FIX-29). Ordem de merge recomendada: S → P."
---

# Bloco P — Bloco de lance do card de simulação (semânticas misturadas)

Item único: FIX-30 (o FIX-29 que abria este bloco migrou pro
bloco-s-funil-canonico na consolidação de 2026-06-12 — mesma região do
handler interest). Aqui fica só a INCOERÊNCIA NUMÉRICA do card: 74,43% do
lance total rotulado como "lance embutido" + "recebe carta cheia" na mesma
tela (offer-mapper reusa `bidPercentage` pro embutido).

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-p-lance-do-card/ (item FIX-30). O item tem
> `decisao_pendente` PARCIAL: a rotulagem honesta (mapper + render) vai JÁ;
> o que depender da semântica AGX (perguntas 7/8 da
> docs/jornada/proposta-simulador.md) fica explícito como TODO no código.
> TDD strict nas camadas exigidas no item (fixture = captura real da oferta
> ÂNCORA; ver falhar antes do fix). 1 commit test+fix:, mover pra done/ ao
> concluir e apagar a pasta do bloco.
