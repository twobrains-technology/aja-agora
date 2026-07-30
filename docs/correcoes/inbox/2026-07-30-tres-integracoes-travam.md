# Três testes de integração travam (20s+), fora do gate do caminho do dinheiro

**Status:** aberto · **Severidade:** média · **Achado em:** 2026-07-30

## O quê

Três arquivos de integração travam — não demoram, travam — quando rodam contra o
Postgres local:

- `src/lib/mesa/mesa-flow.e2e.integration.test.ts`
- `src/app/api/chat/route.identify-celular-ddi.integration.test.ts`
- `src/app/api/admin/simulator/attendant/[attendantId]/interactive-reply/route.test.ts`

Eles estão **EXCLUÍDOS** do script `test:caminho-do-dinheiro` (package.json), que
roda no pre-commit. A exclusão é explícita e está registrada aqui para não virar
cobertura fantasma: quem lê o gate verde precisa saber o que ele NÃO cobre.

## O que foi provado

- Falham **igual em `65bf1301`** (antes das mudanças que os expuseram) — não são
  regressão do FIX-417/418/419.
- Falham **com e sem** as mudanças da árvore de trabalho.
- O número de falhas **varia entre 3 e 4** de execução para execução.
- Postgres **sem locks** e **sem transação pendurada** (`pg_locks`,
  `pg_stat_activity` conferidos).
- Com `--testTimeout=90000` ainda falha em 90.034 ms → **travam**, não são lentos.
- O `route.identify-celular-ddi` afirma no próprio comentário não precisar de LLM
  ("nextGate = credit, pipeGatePrompt, SEM LLM"), então a hipótese do gateway
  caído não explica.

## O que NÃO foi provado

**A causa raiz.** As evidências acima descartam regressão de produto e locks de
banco, mas não apontam o culpado. Suspeitas não verificadas: pool de conexões,
handle aberto no teardown do route handler, ou dependência de estado deixada por
outro teste na mesma execução.

## Por que a exclusão, e não "deixa vermelho"

O gate foi criado no FIX-415 porque um teste vermelho passou despercebido — o
`test:unit` excluía `route*` e `*.integration*`, ou seja, o caminho do dinheiro
inteiro. Um gate permanentemente vermelho por ambiente é desligado na primeira
sexta-feira, e aí o buraco volta inteiro.

Os testes do caminho do DINHEIRO seguem dentro do gate e verdes:
`route.fix-263-antirefazer`, `contract-input`, `fulfillment.integration`.

## Próximo passo

Instrumentar um dos três com log de progresso para descobrir em que await ele
para. Enquanto isso, rodar manualmente antes de mexer em mesa/handoff/identify.
