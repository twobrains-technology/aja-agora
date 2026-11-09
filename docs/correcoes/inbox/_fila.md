# Fila de correções — aja-agora (gestão do líder)

Regra: bug novo → card + `worker` em background → `reviewer` → status aqui. Só some quando está `fechado` com prova.

| # | slug | sev | status | dono | prova |
|---|------|-----|--------|------|-------|
| 1 | llm-401-gateway-local | alta | feito no local, provado | líder | turno real: haiku respondeu, erro=ok, 2 msgs no banco |
| 2 | crypto-randomuuid-http | média | corrigido em c01fab6e e no dev (run 42628832084) | worker fa2fe958, conferido pelo líder | 3 testes ok, typecheck ok; falta abrir em http no navegador |
| 3 | sem-loading-apos-enviar | alta | corrigido em 95bea2e9 e no dev (run 42630754091) | worker d90f4256, conferido pelo líder | 7 testes ok, typecheck ok; falta ver na tela |
| 4 | api-404-cache-next-local | alta | feito no local, provado; REINCIDIU 1x ao recriar o container | líder | /api/track 405; pendente: limpar .next/dev no boot do container |
| 5 | agente-nao-mostra-card-telefone | alta | corrigido em de8b302e (card emitido pelo modelo; tool result nomeia o card) | worker f0d1626a, conferido pelo líder | 282 testes ok com banco real; medição do worker: celular 100% |
| 6 | agente-nao-mostra-card-valor | alta | corrigido em de8b302e; valor ~75-100% nas medições (varia) | worker f0d1626a | value-picker já tinha as abas; fallback genérico removido |
| 9 | agente-nao-mostra-card-nome | alta | corrigido em de8b302e (name_prompt virou card emitível) | worker f0d1626a | nome 0% → ~86-100% nas medições |
| 10 | chips-fora-de-contexto | alta | corrigido em de8b302e (servidor não adivinha atalho: P11) | worker f0d1626a | só a lista escrita pelo modelo vira toque |
| 11 | indicador-duplicado | média | corrigido em 9bfffac3 e no dev (run 42658405860) | worker e59ca33b, conferido pelo líder | 15 testes ok, typecheck ok; falta ver na tela |
| 12 | fechamento-robotico | média | corrigido em 5c76a3de (enxuto); evolui para o card único do item 17 | worker bef41ba3, conferido pelo líder | 3 testes ok, biome ok |
| 13 | card-preenchimento-fica-velho | alta | corrigido em 6dbb9a44 (regra central de selado) | worker, conferido pelo líder | 14 testes falhavam antes; falta ver no navegador |
| 16 | card-enter-nao-envia | alta | corrigido em 6dbb9a44 (<form onSubmit>) | worker | falta ver no navegador |
| 15 | card-sem-foco-e-atrasado | alta | corrigido em 6dbb9a44 (foco ao montar, sem disabled por streaming) | worker | falta ver no navegador |
| 14 | clique-simular-obsoleto | alta | corrigido em a627f3f8 (web); WhatsApp (formatter.ts) fica para depois | worker cb0f7457, conferido pelo líder | 72 testes ok |
| 17 | card-de-finalizacao | média | na fila: espera o commit do f0d1626a (types.ts, artifact-renderer.tsx). Resolve a dúvida da proposta no bug 12 | — | decisão do Kairo: UM card; confete; WhatsApp como está; proposta pequena e branca |
| 19 | card-antes-da-pergunta | alta | corrigido em 6dbb9a44 (card de preenchimento espera o fim do beat) | worker, conferido pelo líder | teste de ordem falhava antes e passa; prova viva: card depois da fala |
| 20 | consultor-calou-o-agente | alta | corrigido em 6dbb9a44 (humano só com claim ou caso ativo na mesa) | worker, conferido pelo líder | prova viva: linha handed_off sem dono com o telefone do operador não cala mais o agente |
| 18 | hook-pre-commit-sem-banco | média | aberto: o pre-commit roda testes de integração que precisam de Postgres em 127.0.0.1:5433, que não existe neste Mac (barrou 3 workers; o f0d1626a estourou 30 min). Contorno usado: banco descartável em aja-shared-pg.orb.local + VITEST_MAX_WORKERS=1 | — | commits de8b302e e a627f3f8 passaram assim |
| 8 | prompt-do-vendedor-testes-velhos | média | aberto: 5 testes falham no HEAD da develop e barram qualquer commit nesse arquivo | — | 4 testes de regra antiga (nome primeiro, nunca diga) + teto 20.000 (hoje 23.507) |
| 7 | bevi-vitrine-env-compose | alta | feito no local, provado | líder | turno real: buscar_cartas com cartas do Banco do Brasil; pendente: script que gera o .env |
| D1 | deploy-dev (c01fab6e + docs) | — | feito | worker 0cab5529, conferido pelo líder | run 42628832084 success, sha e01fc6dd, rollout ECS (serviço e worker) success; sem URL de health |
| D2 | deploy-dev (95bea2e9 + docs) | — | feito | worker 21fb4394, conferido pelo líder | run 42630754091 success, sha 292715a2, rollout ECS (serviço e worker) success |
| D3 | deploy-dev (9bfffac3 + docs) | — | feito | worker e812ced5, conferido pelo líder | run 42658405860 success, sha 8a5f6a9c, rollout ECS (serviço e worker) success |
| D4 | deploy-dev (cards, fecho, clique de interesse) | — | feito | worker df054e6e, conferido pelo líder | run 42665542329 success, sha f90256a3, rollout ECS (serviço e worker) success |

Regra (Kairo, 09/11): subir para o dev é demanda assíncrona, igual aos bugs: worker em background, líder confere pelo run e pelo ECS.

