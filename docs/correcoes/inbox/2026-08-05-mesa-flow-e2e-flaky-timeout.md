# Suíte não-determinística — 2 flakies da mesa + 1 residual (2026-08-05)

> Achado COLATERAL enquanto eu corrigia o gate `desire` (pergunta de abertura do
> funil). **Não é regressão daquele fix** — provado abaixo. É dívida pré-existente
> que deixa `pnpm test` vermelho de forma não-determinística.

## Placar medido (3 execuções de `pnpm test` inteiro)

| teste | r1 | r2 | r3 | veredito |
|---|---|---|---|---|
| `mesa-flow.e2e` › "caminho do admin" | ✗ | ✗ | ✗ | pré-existente, também falha ISOLADO ~1/3 |
| `simulator/attendant/…/interactive-reply` › FIX-174 | ✗ | ✗ | ✗ | pré-existente (falha sem o patch do `desire`) |
| `agora-queries` › `computePulso` | ✗ | ✓ | ✓ | **residual meu** — ver "Conserto parcial" |

Os dois primeiros são a mesma família: **claim atômico da mesa**, ambos estourando
timeout de 20s. Provavelmente a mesma causa.

## Conserto parcial já aplicado (`agora-queries`)

`computePulso` conta o banco INTEIRO; o teste provava por delta com `antes` no
`beforeAll` e `depois` em três `it` separados — janela enorme para outro arquivo
de integração escrever no meio. Fundi os três casos num só, com as duas medições
adjacentes.

**Resultado honesto: caiu de 3 casos falhando para 1, e ainda falhou 1 de 3.**
Encolher a janela reduz a probabilidade; não elimina, porque a causa é o banco
compartilhado (§2 de `2026-06-21-divida-infra-teste-qa-noturno.md` — isolamento
por schema/worker, apontado lá como o bloco de maior ROI). Enquanto aquilo não for
feito, qualquer asserção sobre agregado global fica sujeita a ruído.

## Sintoma (mesa-flow)

```
FAIL  src/lib/mesa/mesa-flow.e2e.integration.test.ts
  > caminho do admin: transbordo cria handoff SEM dono + broadcast → claim de A
    move a raia p/ em_atendimento → B é sombreado → mensagem ao cliente persiste

Error: Test timed out in 20000ms.   (sempre 20002-20007ms — estoura o teto, não falha asserção)
```

Os outros 6 casos do mesmo arquivo passam sempre.

## Frequência medida

Três execuções **isoladas** e consecutivas do arquivo (sem concorrência com outros
arquivos de integração):

| rodada | resultado |
|---|---|
| 1 | 7 passed |
| 2 | **1 failed** \| 6 passed |
| 3 | 7 passed |

~1 em 3. Não é o problema de DB compartilhado já anotado em
`2026-06-21-divida-infra-teste-qa-noturno.md` §2 — aquele é colisão **entre**
arquivos sob paralelismo; este falha com o arquivo rodando sozinho.

## Que NÃO é o meu fix (provado)

`git stash` do único arquivo tocado (`src/lib/agent/orchestrator/gate-questions.ts`)
e execução isolada: **falha do mesmo jeito**, mesmo timeout de 20s. Com o patch
aplicado, passa 2 de 3. O fix é ortogonal.

## Hipótese levantada e DESCARTADA

O stdout do teste mostra o broadcast indo para 8 números, sendo 6 residuais de
outros testes que semeiam `mesa_attendants` e não limpam:

```
Ana | 5563219376457      Corrida A | 5563816265348    Dono    | 5563002451971
Bruno | 5563997305049    Corrida B | 5563076758643    NaoDono | 5563338890444
```

Parecia volume de envios estourando o teto. **Descartada:** tentei apagar essas 6
linhas, o `DELETE` foi **rejeitado** por FK (`mesa_handoffs_mesa_attendant_id_fk`)
— ou seja, o banco não mudou — e o teste passou 7/7 na sequência. O volume não é a
variável.

## ⚠️ Root cause NÃO provado

Não consegui isolar. O que sei: é timing (sempre o teto exato de 20s, nunca
asserção), reproduz isolado, e o caso que falha é justamente o que exercita
**claim concorrente** (A assume, B é sombreado). Cheira a race no claim atômico ou
a `await` de broadcast que às vezes não resolve — mas isso é **hipótese, não
diagnóstico**.

O que falta verificar:
- ~~Rodar com `--testTimeout` maior: estoura de verdade ou é deadlock?~~ **INDÍCIO
  (2026-08-09):** `pnpm test:caminho-do-dinheiro` — que roda com `--testTimeout=240000`
  e `--no-file-parallelism` — passou **61 arquivos / 304 testes verdes em 63s**, os dois
  flakies incluídos. Aponta para LENTIDÃO, não deadlock. É **uma** rodada contra um
  ~1/3 de frequência, então não fecha o diagnóstico: falta repetir com 240s até ter
  amostra, e separar o que pesou (o teto maior ou o `--no-file-parallelism`).
- `pg_stat_activity` durante o travamento — há lock esperando?
- Qual `await` não resolve: instrumentar o teste passo a passo (o stdout mostra o
  broadcast COMPLETO saindo, então trava depois dele)
- Se o acúmulo de `mesa_handoffs` órfãos (que a FK denunciou) muda a probabilidade
  ao longo do tempo — o banco de dev nunca é limpo dessas linhas

## Por que importa

`pnpm test` fica vermelho de forma aleatória. Isso corrói o gate: quem vê vermelho
intermitente aprende a ignorar vermelho — e aí uma regressão de verdade passa. Vale
também para o gate do `merge-wave`, que reprova bloco limpo por azar de rodada.

## Arquivos

- `src/lib/mesa/mesa-flow.e2e.integration.test.ts` (o teste)
- `src/app/api/admin/simulator/attendant/[attendantId]/interactive-reply/route.test.ts`
  (segundo flaky, mesma família — também 20s de timeout no claim)
- `src/lib/whatsapp/mesa/routing.ts`, `src/lib/mesa/dispatch.ts` (broadcast/claim)
- `src/lib/whatsapp/mesa/claim.ts` (claim atômico)
- `src/lib/admin/agora-queries.integration.test.ts` (residual — depende do
  isolamento de banco, não tem conserto local)
