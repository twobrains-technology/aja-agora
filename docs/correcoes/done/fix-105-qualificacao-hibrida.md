---
id: FIX-105
titulo: "Qualificação híbrida: binárias com botão, valor por conversa"
status: done
executado_em: 2026-06-29
commit: "feat: torna a qualificação híbrida explícita — binárias por botão, valor por conversa (FIX-105)"
bloco: bloco-jornada-entrada
arquivos:
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/system-prompt.ts
rodada: 2026-06-28 — revisão da jornada de entrada (decisões Kairo)
---

## Palavras do operador
> (Q "Qualificação") = **"Híbrido por tipo de pergunta"**: perguntas binárias
> (já conhece consórcio? tem reserva pra lance?) mantêm botão; perguntas abertas
> (valor) viram conversa.

## Cenário exato
Hoje a qualificação inteira vira sequência de botões/listas (menu atrás de menu
— o que mais robotiza). O Kairo quer híbrido: perguntas BINÁRIAS (experiência
prévia, tem reserva pra lance) mantêm os botões (resposta clara e rápida);
perguntas ABERTAS (valor) viram conversa.

## Root cause investigado
- `src/lib/agent/qualify-config.ts` define cada gate como gate de UI (botão/lista).
- `src/lib/agent/system-prompt.ts` orienta o estilo da pergunta.
A mudança é classificar os gates: binárias → mantêm gate de botão; valor →
conversacional (já coberto por FIX-104). Prazo já removido por FIX-103.

## Correção proposta
| O quê | Onde |
|---|---|
| Manter gates binários (experience, lance) como botão | qualify-config.ts (ajuste leve) |
| Prompt deixa explícito o híbrido: binárias = botão, valor = conversa | system-prompt.ts |

(Depende de FIX-104 pro valor conversacional; FIX-103 já tirou o prazo.)

## Regressão exigida (3 camadas)
- Camada 1: gates binários presentes como botão; prompt descreve o híbrido.
- Camada 2: cassette — experiência/lance via botão; valor via conversa.
