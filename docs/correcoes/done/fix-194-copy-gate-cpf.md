---
id: FIX-194
titulo: "Tirar 'Quanto custa o carro?' do balão do gate que só coleta CPF/celular"
status: done
commit: 1cf24c75
executado_em: 2026-07-02
bloco: bloco-a-reveal-dados
arquivos:
  - src/lib/agent/orchestrator/directives.ts
rodada: "2026-07-01 · onda reveal-refino · qa-dono-produto (carro web, conv fe2e8a09) + refino spec"
---

## Palavras do operador
Achado da rodada (defeito E): "o agente pergunta 'Quanto custa o carro?' no mesmo balão do gate que só coleta CPF/celular".

## Cenário exato
Passo 3 (identidade): o formulário coleta CPF+celular+LGPD, mas o texto do agente no mesmo turno pergunta o preço do carro — que só é coletado depois. O usuário não pode responder ali. Fere "uma coisa por vez". Evidência: `docs/correcoes/inbox/_evidencia/passo3-identidade.png`.

## Root cause investigado (a confirmar no código)
A diretiva/copy do gate de identidade mistura a pergunta de valor. Provável em `directives.ts` (texto do turno do gate identify) — confirmar o trecho que injeta a pergunta de preço no gate de CPF.

## Correção proposta
| O quê | Onde |
|---|---|
| A copy do turno do gate de identidade não pergunta valor (o valor tem seu próprio gate depois) | `directives.ts` |

## Regressão exigida
- Camada 1: no gate identify, o texto do agente não contém pergunta de valor/preço do bem.
