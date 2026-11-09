# Fila de correções — aja-agora (gestão do líder)

Regra: bug novo → card + `worker` em background → `reviewer` → status aqui. Só some quando está `fechado` com prova.

| # | slug | sev | status | dono | prova |
|---|------|-----|--------|------|-------|
| 1 | llm-401-gateway-local | alta | feito no local, falta prova no navegador | líder | haiku 200 pela chave do app |
| 2 | crypto-randomuuid-http | média | corrigido em c01fab6e e no dev (run 42628832084) | worker fa2fe958, conferido pelo líder | 3 testes ok, typecheck ok; falta abrir em http no navegador |
| D1 | deploy-dev (c01fab6e + docs) | — | feito | worker 0cab5529, conferido pelo líder | run 42628832084 success, sha e01fc6dd, rollout ECS (serviço e worker) success; sem URL de health |

Regra (Kairo, 09/11): subir para o dev é demanda assíncrona, igual aos bugs: worker em background, líder confere pelo run e pelo ECS.

