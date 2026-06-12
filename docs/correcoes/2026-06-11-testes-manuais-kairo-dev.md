# Ata — Testes manuais do Kairo no dev (2026-06-11, pós-deploy da auditoria do dial)

Sessão de anotação (todo-blocks). Kairo testou o funil no dev logo após o
deploy dos fixes do dial (C1-C5 + snapshot anchor) e reportou 4 defeitos por
print. Itens FIX-27..FIX-30, blocos N/O/P (onda 1, todos paralelos).

## Citações e itens

| Citação do Kairo | Item | Bloco |
|---|---|---|
| "nao faz setnio nenhum ter pedido o numero uma vez qo numero foi informado." | FIX-27 — opt-in WhatsApp pede o número pela 3ª vez (lead form e identify já coletaram), input vazio, no meio de fechamento com erro Bevi pendente | bloco-n-optin-redundante |
| "cliquei em quero ver mais opcoes e ele mostrou duplicado." | FIX-28 — comparativo das "outras opções" com 2 cards ÂNCORA idênticos (buildOtherOptions sem dedupe) | bloco-o-outras-opcoes-dedupe |
| "eh muita alucinacao, eu nao estou entendendo de verdade." | FIX-29 — clique "Ajustar valor" dispara fechamento determinístico ("vou reservar... te conectar com nosso consultor" + lead form) | bloco-p-acoes-e-lance-do-card |
| (mesma sessão — números contraditórios no card) | FIX-30 — "COM LANCE EMBUTIDO (74,43%)" rotulando o lance TOTAL necessário + "recebe R$ 80.000" (carta cheia) na mesma tela | bloco-p-acoes-e-lance-do-card |

## Achado transversal

A percepção de "muita alucinação" veio de defeitos majoritariamente
**determinísticos**: kind único `interest` pra toda action do card (front),
copy fixa com "consultor" no backend, mapper reusando `bidPercentage` pro
embutido, e prompt MANDANDO oferecer opt-in porque o derive não enxerga
telefone já capturado. Nenhum exige mexer no modelo — todos têm fix de
código/prompt com regressão nas 3 camadas.

Derivada pra AGX: pergunta 8 adicionada em `docs/jornada/proposta-simulador.md`
(semântica do `bidPercentage` — embutido máximo × lance necessário).
