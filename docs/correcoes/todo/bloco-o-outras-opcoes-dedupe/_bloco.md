---
bloco: bloco-o-outras-opcoes-dedupe
onda: 1
depends_on: []
paralelo_com: [bloco-n-optin-redundante, bloco-p-acoes-e-lance-do-card]
itens: [FIX-28]
escopo_arquivos:
  - src/lib/bevi/other-options.ts
conflitos_esperados: []
---

# Bloco O — Dedupe das "outras opções" (cards duplicados no comparativo)

Item único: FIX-28. Encontrado nos testes manuais do Kairo no dev
(2026-06-11): "Quero ver outras opções" exibiu 2 cards ÂNCORA idênticos.
`buildOtherOptions` não dedupa ofertas equivalentes nem exclui a recomendada
por id. Arquivo único, disjunto dos outros blocos — merge limpo.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-o-outras-opcoes-dedupe/ (item FIX-28). ANTES de
> codar: confirme no DB do dev a hipótese pendente do item (a recomendada da
> conversa era ÂNCORA? `meta.recommendedAdministradora` estava populado?) e
> registre o achado no item. TDD strict (Camada 1 com fixture de captura real
> contendo cotas duplicadas — ver teste falhar primeiro). 1 commit
> `test+fix:`, mover o item pra done/ ao concluir e apagar a pasta do bloco.
