---
id: FIX-376
titulo: "Cadência intra-janela: os toques 1, 2 e 3 dentro das 24 h"
status: done
commit: 5164aeb0
executado_em: 2026-09-28
bloco: bloco-regua
arquivos:
  - src/lib/remarketing/motor.ts
  - src/lib/remarketing/regua.ts
  - src/lib/remarketing/remarketing-config.ts
  - src/lib/workers/remarketing-cycle.ts
rodada: 2026-09-28
---
## Palavras do operador
Reunião de 22/09 (Kairo, 12:20:41): *"Tem que ser pelo menos umas três mensagens, né?… o primeiro toque,
o segundo toque, o terceiro toque. Pinguei e ele não respondeu, aí a gente vai marcar ele como perdido."*
A régua hoje entra com 90 min de silêncio e depois **3 dias** e **5 dias** (`remarketing_config` em
"fabrica") — o combinado era a escala curta, de minutos, dentro da janela de 24 h.

## Cenário exato (medido em produção, 28/09)
`[remarketing-cycle] avaliadas 210, elegíveis 0` — a régua roda a cada 30 s e não entra ninguém. Nos
últimos 30 dias: 8 pessoas na régua, 4 esgotaram os três toques sem responder, 1 respondeu. Com 3 e 5
dias entre toques, o toque 3 sai 4 dias depois do toque 1 — fora de qualquer janela de conversa.

## Root cause
Não existe o parâmetro. `ParametrosRegua` (`motor.ts:220-265`) só tem `diasAteSegundoToque`,
`diasAteTerceiroToque`, `maxToques` e afins; `grep escalaDeRetomadaMs src/` = 0. O agendamento
(`regua.ts`) sempre usa `esperaSilencioMs + dias`.

## Correção proposta
| O quê | Onde |
|---|---|
| Novo parâmetro nomeado `escalaDeRetomadaMs` (fábrica `[10, 20, 30]` min) em `ParametrosRegua` | `motor.ts` |
| No cadastro, com origem "fabrica" e validação de faixa | `remarketing-config.ts` |
| Quando o último inbound do cliente está DENTRO da janela de 24 h, agendar pela escala curta em vez de `esperaSilencio + dias`; fora dela, manter o desenho atual | `regua.ts` / `remarketing-cycle.ts` |
| O número de toques continua vindo do cadastro (`maxToques`) — não fixar em código | `remarketing-config.ts` |

## Regressão exigida
Unitário puro da decisão de agendamento (dentro × fora da janela) + integração no ciclo: pessoa parada
há 1 h recebe o toque 1, o 2 e o 3 na escala curta; o agendamento antigo continua valendo para quem
está fora da janela.
