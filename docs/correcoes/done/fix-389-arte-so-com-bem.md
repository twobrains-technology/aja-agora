---
id: FIX-389
titulo: "Arte só quando o bem é conhecido — confirmar e travar"
status: done
commit: 645d3f5f
executado_em: 2026-09-29
bloco: bloco-comunicacoes
arquivos:
  - src/lib/remarketing/motor.ts
rodada: 2026-09-28
---
## Palavras do operador
Reunião de 22/09: a regra combinada é "nenhuma arte quando o bem é desconhecido" (o desenho do Gustavo
já previa a frase só com o bem conhecido).

## Cenário exato
`arteDoObjetivo` (`motor.ts:178-183`) já devolve `null` sem bem conhecido, e `motor.test.ts:82-118`
("AJA-14 — arte só quando o bem é CONHECIDO") cobre `null`, `undefined`, `""`, desconhecido e `caminhao`.

## Root cause
Não é defeito — o comportamento já existe e já tem teste. O que falta é a **ligação com a fase**: com o
FIX-388, a arte tem que acompanhar a chave escolhida (uma comunicação de `fechamento` sem bem não pode
pegar a arte do bem de outra pessoa).

## Correção proposta
| O quê | Onde |
|---|---|
| A arte escolhida é a da MESMA chave de template que o dispatcher resolveu | `motor.ts` + `template-dispatch.ts` |
| Teste que prova a correspondência chave ↔ arte nos três estados de fase | `motor.test.ts` (estender) |

## Regressão exigida
O teste do AJA-14 continua verde, e mais: chave de fase genérica nunca recebe arte de bem.
