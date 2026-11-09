# Fila de correções — aja-agora (gestão do líder)

Regra: bug novo → card + `worker` em background → `reviewer` → status aqui. Só some quando está `fechado` com prova.

| # | slug | sev | status | dono | prova |
|---|------|-----|--------|------|-------|
| 1 | llm-401-gateway-local | alta | feito no local, provado | líder | turno real: haiku respondeu, erro=ok, 2 msgs no banco |
| 2 | crypto-randomuuid-http | média | corrigido em c01fab6e e no dev (run 42628832084) | worker fa2fe958, conferido pelo líder | 3 testes ok, typecheck ok; falta abrir em http no navegador |
| 3 | sem-loading-apos-enviar | alta | corrigido em 95bea2e9 e no dev (run 42630754091) | worker d90f4256, conferido pelo líder | 7 testes ok, typecheck ok; falta ver na tela |
| 4 | api-404-cache-next-local | alta | feito no local, provado | líder | /api/track 405, turno real respondeu |
| D1 | deploy-dev (c01fab6e + docs) | — | feito | worker 0cab5529, conferido pelo líder | run 42628832084 success, sha e01fc6dd, rollout ECS (serviço e worker) success; sem URL de health |
| D2 | deploy-dev (95bea2e9 + docs) | — | feito | worker 21fb4394, conferido pelo líder | run 42630754091 success, sha 292715a2, rollout ECS (serviço e worker) success |

Regra (Kairo, 09/11): subir para o dev é demanda assíncrona, igual aos bugs: worker em background, líder confere pelo run e pelo ECS.

