---
id: FIX-377
titulo: "O portão de retomadas para de matar o toque 2 e 3 em silêncio"
status: todo
bloco: bloco-regua
arquivos:
  - src/lib/remarketing/retomada.ts
  - src/lib/remarketing/motor.ts
  - src/lib/remarketing/regua.ts
rodada: 2026-09-28
---
## Palavras do operador
PRD de 22/09, §AJA-20 T3: *"o portão `MAX_RETOMADAS`/`BACKOFF_RETOMADA_MS` é o risco nº 1: sem tratá-lo,
o item passa nos testes e não dispara em produção."*

## Cenário exato
`retomada.ts:18` `MAX_RETOMADAS = 2`, `:20` `BACKOFF_RETOMADA_MS = 30 min`. O motor devolve
`semDisparo("teto_de_retomadas")` (`motor.ts:443`) **sem gravar**, e o caminho é
`texto_livre → turno_de_retomada`. Com a escala curta do FIX-376, o toque 2 e o 3 caem nesse teto e
morrem mudos.

## Root cause
O contador de retomadas do watchdog (`conversationMetadata.retomada`) é do TURNO de retomada, não da
série de toques da régua. O PRD recomenda a opção **(b)**: os toques intra-janela ganham **contador
próprio**, e o `retomada.ts` fica intacto (é dele o outro problema — o turno que morreu sem conduzir).

## Correção proposta
| O quê | Onde |
|---|---|
| Contador próprio por toque da régua (não usar `meta.retomada`) | `regua.ts` / `motor.ts` |
| `retomada.ts` não muda | — |
| Registrar o motivo do bloqueio em vez de devolver mudo | `motor.ts:443` |

## Regressão exigida
Integração no ciclo: com a escala curta ligada, o toque 2 e o 3 SAEM (prova por comando, não por
leitura de código); quem tem opt-out ou é telefone da equipe continua fora.
