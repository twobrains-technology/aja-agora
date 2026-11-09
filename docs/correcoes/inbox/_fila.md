# Fila de correções — aja-agora (gestão do líder)

Regra: bug novo → card + `worker` em background → `reviewer` → status aqui. Só some quando está `fechado` com prova.

| # | slug | sev | status | dono | prova |
|---|------|-----|--------|------|-------|
| 1 | llm-401-gateway-local | alta | feito no local, falta prova no navegador | líder | haiku 200 pela chave do app |
| 2 | crypto-randomuuid-http | média | corrigido em c01fab6e (develop local, sem push) | worker fa2fe958, conferido pelo líder | 3 testes ok, typecheck ok; falta abrir em http no navegador |
| D1 | deploy-dev (c01fab6e + docs) | — | despachado, em andamento | worker (deploy-dev) | push develop, workflow_dispatch env=dev, rollout ECS, health |

Regra (Kairo, 09/11): subir para o dev é demanda assíncrona, igual aos bugs: worker em background, líder confere pelo run e pelo ECS.

