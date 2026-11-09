# Fila de correções — aja-agora (gestão do líder)

Regra: bug novo → card + `worker` em background → `reviewer` → status aqui. Só some quando está `fechado` com prova.

| # | slug | sev | status | dono | prova |
|---|------|-----|--------|------|-------|
| 1 | llm-401-gateway-local | alta | feito no local, provado | líder | turno real: haiku respondeu, erro=ok, 2 msgs no banco |
| 2 | crypto-randomuuid-http | média | corrigido em c01fab6e e no dev (run 42628832084) | worker fa2fe958, conferido pelo líder | 3 testes ok, typecheck ok; falta abrir em http no navegador |
| 3 | sem-loading-apos-enviar | alta | corrigido em 95bea2e9 e no dev (run 42630754091) | worker d90f4256, conferido pelo líder | 7 testes ok, typecheck ok; falta ver na tela |
| 4 | api-404-cache-next-local | alta | feito no local, provado; REINCIDIU 1x ao recriar o container | líder | /api/track 405; pendente: limpar .next/dev no boot do container |
| 5 | agente-nao-mostra-card-telefone | alta | correção PRONTA na árvore, SEM commit (pre-commit barra) | worker e4909c56 | parágrafo em prompt-do-vendedor.ts + teste; POST real: card sai em parte das rodadas, não é garantido |
| 6 | agente-nao-mostra-card-valor | alta | mesma correção do 5; causa: modelo não chama mostrar_card; component value-picker tem as abas (sem regressão) | worker e4909c56 | value_picker saiu 2/3, whatsapp_optin 0/3 após a mudança |
| 9 | agente-nao-mostra-card-nome | alta | enviado ao worker f0d1626a (mesma família dos bugs 5 e 6) | worker f0d1626a | — |
| 10 | chips-fora-de-contexto | alta | enviado ao worker f0d1626a (mesmo mecanismo: garantirChip) | worker f0d1626a | — |
| 8 | prompt-do-vendedor-testes-velhos | média | aberto: 5 testes falham no HEAD da develop e barram qualquer commit nesse arquivo | — | 4 testes de regra antiga (nome primeiro, nunca diga) + teto 20.000 (hoje 23.507) |
| 7 | bevi-vitrine-env-compose | alta | feito no local, provado | líder | turno real: buscar_cartas com cartas do Banco do Brasil; pendente: script que gera o .env |
| D1 | deploy-dev (c01fab6e + docs) | — | feito | worker 0cab5529, conferido pelo líder | run 42628832084 success, sha e01fc6dd, rollout ECS (serviço e worker) success; sem URL de health |
| D2 | deploy-dev (95bea2e9 + docs) | — | feito | worker 21fb4394, conferido pelo líder | run 42630754091 success, sha 292715a2, rollout ECS (serviço e worker) success |

Regra (Kairo, 09/11): subir para o dev é demanda assíncrona, igual aos bugs: worker em background, líder confere pelo run e pelo ECS.

