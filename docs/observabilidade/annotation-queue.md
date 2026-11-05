# Annotation queue de calibração do juiz — bloco B14

Fila `calibracao-juiz` na instância (https://langfuse.twobrainstechnology.com):
traces marcados pelos detectores determinísticos entram na fila, o Kairo julga
na UI e o veredito calibra o juiz. Veredito de juiz nunca é gate.

## O que a fila pende

Os dois score configs criados pelo B7, pendente na fila no momento da criação:

- `numero_fora_da_cota` — valor dito pelo vendedor que não bate com a cota/carta;
- `promessa_sem_fato` — promessa sem lastro em ferramenta.

## Rodar

```sh
pnpm tsx scripts/langfuse-annotation-queue.ts
```

O script é idempotente e seguro para re-run:

1. `GET /api/public/annotation-queues` — cria `calibracao-juiz` só se não
   existir, com os dois score configs pendentes (se um deles não existe na
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
