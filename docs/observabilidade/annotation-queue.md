# Annotation queue de calibração do juiz — bloco B14

Fila `calibracao-juiz` na instância (https://langfuse.twobrainstechnology.com):
traces marcados pelos detectores determinísticos entram na fila, o Kairo julga
na UI e o veredito calibra o juiz. Veredito de juiz nunca é gate.

## O que a fila pende

Os score configs pendentes na fila no momento da criação:

- `numero_fora_da_cota` — valor dito pelo vendedor que não bate com a cota/carta;
- `promessa_sem_fato` — promessa sem lastro em ferramenta;
- `retomada_sem_novidade` — retomada que repete o mesmo pedido sem levar algo
  novo (D-0083, bloco B).

## Os cenários de morte (D-0083, bloco D)

Além dos traces marcados por detector, a fila leva os CENÁRIOS DE MORTE por
sessão (o `sessionId` de cada trace é o `conversationId` do app — enfileirar a
SESSION traz todos os turnos do cenário de uma vez, com ou sem score):

- os 3 perfis de morte da simulação: `voltei-sem-nada`, `silencio-total`,
  `card-travado` — ids lidos dos exports `simulacao-*.json` (raiz e `.eval/`);
- os golden `golden-real-voltei-sem-conteudo` e
  `golden-real-remarketing-identico` — ids lidos do relatório do gate mais
  recente (`.eval/relatorio-gate-*.json`, campo `conversationId` por cenário,
  gravado pelo `scripts/eval-run.ts`).

O que entrou aparece no log do script (`morte     <fonte>`); sem registros
locais, o cenário de morte fica para o próximo re-run.

## Rodar

```sh
pnpm tsx scripts/langfuse-annotation-queue.ts
```

O script é idempotente e seguro para re-run:

1. `GET /api/public/annotation-queues` — cria `calibracao-juiz` só se não
   existir, com os score configs pendentes (se um deles não existe na
   instância, o script para e pede `pnpm tsx scripts/langfuse-score-configs.ts`);
2. para cada detector, busca os scores marcados:
   `GET /api/public/v3/scores?name=<score>&value=true&dataType=BOOLEAN`
   (o filtro por valor exige `dataType=BOOLEAN` e `true`/`false` — sondado
   contra a instância em 05/11/2026; sem `dataType` a API rejeita);
3. enfileira cada trace novo via `POST /api/public/annotation-queues/<id>/items`
   — o que já está na fila não entra de novo (compara com `GET .../items`).

Sem scores reais dos detectores na instância, o script reporta
`enfileiramento PENDENTE de dados` — a fila existe e o preenchimento acontece
no primeiro trace marcado.

Credenciais: ambiente (`LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`,
`LANGFUSE_SECRET_KEY`) ou cofre `secrets.sh get-key pi-agentes-aja-langfuse
<CHAVE>`. Sem credenciais o script não roda. Nada imprime chave.

## Paginação

A API de annotation queues pagina por `page`/`totalPages`; a de scores (v3)
pagina por `cursor` no `meta`. O script percorre as duas formas.

## Estado

- Fila criada: `calibracao-juiz` — id `cmw2yn1g2001emv060rwpl3oe` (05/11/2026).
- Enfileiramento: PENDENTE de dados — nenhum score real dos detectores
  publicado ainda (verificação de 05/11/2026: `GET /api/public/v3/scores`
  com filtro por ambos os nomes retornou vazio).
