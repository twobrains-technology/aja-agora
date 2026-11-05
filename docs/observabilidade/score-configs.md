# Catálogo de score configs — Langfuse (bloco B7)

Instância: https://langfuse.twobrainstechnology.com. Fonte de verdade: o script
idempotente `scripts/langfuse-score-configs.ts` (`GET` primeiro, cria só o que
falta). Credenciais: ambiente ou cofre `secrets.sh get-key
pi-agentes-aja-langfuse <CHAVE>` — nunca em arquivo versionado.

Recriar de outra máquina:

```sh
pnpm tsx scripts/langfuse-score-configs.ts
```

## Sinais BOOLEAN (fato de servidor)

| nome | o que mede |
|---|---|
| `numero_fora_da_cota` | valor dito pelo vendedor não bate com o que a cota/carta mostra (parcela, prazo, custo total) |
| `promessa_sem_fato` | promessa sem lastro em ferramenta (ex.: grupo novo/em andamento sem o dado da busca) |
| `afirmacao_comparativa_falsa` | superlativo dito pelo vendedor ("a menor taxa", "o mais curto", "o melhor") que o conjunto devolvido pelas tools desmente — outra opção tem valor melhor |
| `conducao_entregue` | a resposta deixa próximo passo — a conversa não morreu (premissa P0) |
| `tool_recusou` | ferramenta recusou a chamada no turno (parâmetro, permissão ou erro de uso) |

## Dimensões NUMERIC (rubrica, 0 a 1)

Cinco do juiz offline (`src/lib/eval/rubric.ts`, schema em `src/lib/eval/types.ts`)
mais `conversao`, que é do scorer determinístico (`src/lib/eval/scorer-pipeline.ts`) —
todas entram na média `overallScore`. Prefixo `judge_` separa opinião de modelo
(nunca gate) de sinal determinístico.

| nome | origem | o que mede |
|---|---|---|
| `judge_engajamento` | juiz | engajamento do lead: responde, fornece dados, segue a conversa |
| `judge_discovery` | juiz | descoberta: crédito, prazo e objetivo coletados antes de buscar grupos |
| `judge_continuidade` | juiz | continuidade: referencia e amarra o que foi dito antes |
| `judge_naturalidade` | juiz | tom de vendedor humano, sem jargão nem resposta robótica |
| `judge_assertividade` | juiz | números e fatos ancorados em resultado de ferramenta, sem invenção |
| `judge_conversao` | scorer | conversão: avanço real da contratação (proposta gerada, desfecho) |

## Custo NUMERIC

| nome | o que mede |
|---|---|
| `custo_conversa` | custo de IA da conversa em USD, score por session. Fonte: livro-caixa do eval (`src/lib/eval/judge.ts`); sem conversa não é custo de conversa |

## Como os scores são nomeados hoje (offline)

O juiz offline não publica scores no Langfuse: grava em
`conversation_evaluations` (`overallScore` + `dimensions` com as 6 chaves acima).
O catálogo acima espelha esses nomes; `judge_avancou` não existe no código — o
agregado hoje é `overallScore` (média das 6 dimensões).
