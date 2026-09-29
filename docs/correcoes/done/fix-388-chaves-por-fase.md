---
id: FIX-388
titulo: "A chave do template passa a ser fase × bem, com lista ordenada de candidatas"
status: done
commit: 29ea1476
executado_em: 2026-09-29
bloco: bloco-comunicacoes
arquivos:
  - src/lib/remarketing/motor.ts
  - src/lib/whatsapp/template-dispatch.ts
  - src/lib/workers/remarketing-cycle.ts
rodada: 2026-09-28
---
## Palavras do operador
Bruna, 22/09 12:04:46: *"se a gente sabe que o cara quer moto, já colocar a palavra moto… só para o cara
se sentir do tipo, puta, ele minimamente sabe o que eu quero."*

## Cenário exato
`templateDoObjetivo` (`motor.ts:160-162`) devolve uma chave só: `remarketing_oportunidade_<objetivo>`. Se
esse template não está aprovado na Meta, o toque **enfileira** — e não existe alternativa mais genérica
para o mesmo momento.

## Root cause
A resolução é chave única, não lista. E a checagem de "template aprovado" não pode morar na função pura
(ela é pura por decisão do PRD) — quem decide é o dispatcher.

## Correção proposta
| O quê | Onde |
|---|---|
| Função pura que devolve a **lista ordenada** de chaves candidatas: `[fase+bem, genérico]` | `motor.ts` |
| Convenção das chaves: `remarketing_<fase>_<objetivo>` com fallback para o genérico da fase | `motor.ts` |
| O dispatcher percorre a lista e escolhe a primeira aprovada; sem nenhuma, **enfileira** e alerta | `template-dispatch.ts` |
| O ciclo passa a consumir a lista | `remarketing-cycle.ts` |

## Regressão exigida
Teste puro da ordem de fallback (fase+bem ausente ⇒ genérico da fase; nenhum ⇒ enfileira) e teste do
dispatcher provando que **não desaparece em silêncio**: sem template aprovado, a linha fica pendente e
visível.
