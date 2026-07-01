---
id: FIX-185
titulo: "Teste pré-existente instável: route.admin-message-persistence conta 36/27 mensagens em vez de 24"
status: todo
bloco: bloco-c-frontend-e-flaky
severidade: media
projeto: aja-agora
arquivos:
  - src/app/api/chat/route.admin-message-persistence.test.ts
rodada: 2026-07-01 — pego durante o QA da FIX-179 (integration suite)
---

## Palavras do operador
> (não reportado por voz — achado técnico durante o trabalho da FIX-179; regra do CLAUDE.md: "erro
> que você VÊ, você CORRIGE, mesmo pré-existente")

## Cenário / Root cause A INVESTIGAR
Rodando `pnpm test:integration`, 2 casos de `src/app/api/chat/route.admin-message-persistence.test.ts`
falham: esperam 24 mensagens (12 user + 12 assistant), mas o admin GET retorna 36 (assistant=24) e 27
(assistant=15). **CONFIRMADO via `git stash` que é PRÉ-EXISTENTE** — falha sem nenhuma das mudanças da
FIX-179, então NÃO é regressão minha. Provável: acúmulo de dados entre execuções (cleanup incompleto no
`afterEach`/`beforeEach` — o teste tem os dois) OU contagem duplicada real. A investigar no código do
teste + no que o route persiste.

## Correção proposta (A DEFINIR na investigação)
Provar a causa (cleanup vs bug de contagem real) e corrigir teste OU produto conforme o achado — TDD
strict: se for bug de produto, teste de regressão primeiro; se for isolamento do teste, corrigir o
setup/teardown pra ser determinístico (schema/dados efêmeros por teste, como o padrão do FIX-97).

## Regressão exigida
O próprio teste voltar determinístico e verde. Se a causa for de produto (persistência duplicando),
Camada 1 structural cobrindo o count correto.
